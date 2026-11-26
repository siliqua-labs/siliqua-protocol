import json
from datetime import UTC, datetime

import httpx
import pytest
from oracle_node.config import ConfigError, Settings, load_settings
from oracle_node.signing import encode_methodology, index_id_for
from oracle_node.worker import IndexNotReady, build_report, run_once

KEY = "0x" + "0a" * 32
ORACLE = "0x5fbdb2315678afecb367f032d93f642f64180aa3"
HOUR = datetime(2026, 11, 23, 8, tzinfo=UTC)
NOW = datetime(2026, 11, 23, 9, 5, tzinfo=UTC)
QUOTES = {"a": 3_520_000, "b": 3_523_000, "c": 3_530_000, "d": 3_521_000, "e": 3_525_000}


def detail(quotes=None, hour="2026-11-23T08:00:00Z", published="3523000"):
    quotes = QUOTES if quotes is None else quotes
    return {
        "methodologyVersion": "1.0",
        "index": {"indexId": "GRI-H100", "valueMicroUsd": published},
        "sources": [
            {"name": n, "priceMicroUsd": str(p), "included": True, "fetchedAt": hour}
            for n, p in quotes.items()
        ],
    }


def test_report_is_recomputed_from_the_inputs():
    report = build_report("h100", detail(), NOW)
    assert report.value == 3_523_000
    assert report.sources == 5
    assert report.timestamp == int(HOUR.timestamp())
    assert report.index_id == index_id_for("GRI-H100")
    assert report.methodology_version == encode_methodology("1.0")


def test_own_value_wins_over_the_published_one(caplog):
    report = build_report("h100", detail(published="9999999"), NOW)
    assert report.value == 3_523_000
    assert "differs from the api value" in caplog.text


def test_too_few_sources_is_not_ready():
    with pytest.raises(IndexNotReady, match="not publishable"):
        build_report("h100", detail({"a": 1_000_000, "b": 1_000_000}), NOW)


def test_no_inputs_is_not_ready():
    with pytest.raises(IndexNotReady, match="no inputs"):
        build_report("h100", detail({}), NOW)


def test_slot_before_it_has_ended_is_not_ready():
    with pytest.raises(IndexNotReady, match="outside its report window"):
        build_report("h100", detail(), datetime(2026, 11, 23, 8, 59, tzinfo=UTC))


def test_slot_after_the_late_window_is_not_ready():
    with pytest.raises(IndexNotReady, match="outside its report window"):
        build_report("h100", detail(), datetime(2026, 11, 23, 12, 1, tzinfo=UTC))


def test_inputs_from_two_hours_are_an_error():
    body = detail()
    body["sources"][0]["fetchedAt"] = "2026-11-23T07:00:00Z"
    with pytest.raises(ValueError, match="more than one hour"):
        build_report("h100", body, NOW)


def settings():
    return Settings("http://api", KEY, 31337, ORACLE, ("h100",), 300)


def client(board_outcome):
    posted = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json=detail())
        posted.append(json.loads(request.content))
        return httpx.Response(200, json={"results": [board_outcome]})

    return httpx.Client(transport=httpx.MockTransport(handler)), posted


def test_run_once_posts_a_signed_report():
    http, posted = client({"operator": "0x1", "outcome": "accepted"})
    with http:
        assert run_once(http, settings(), NOW) == 1
    entry = posted[0]["reports"][0]
    assert entry["report"]["value"] == "3523000"
    assert entry["signature"].startswith("0x") and len(entry["signature"]) == 132


def test_run_once_counts_a_duplicate_as_held():
    http, _ = client({"operator": "0x1", "outcome": "duplicate"})
    with http:
        assert run_once(http, settings(), NOW) == 1


def test_run_once_logs_a_report_the_board_refuses(caplog):
    http, _ = client({"outcome": "rejected", "code": "unknown_signer", "message": "no"})
    with http:
        assert run_once(http, settings(), NOW) == 0
    assert "not taken by the board" in caplog.text


def test_run_once_logs_and_continues_when_the_api_fails(caplog):
    http = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(500)))
    with http:
        assert run_once(http, settings(), NOW) == 0
    assert "api call failed" in caplog.text


ENV = {
    "API_URL": "https://api.example/",
    "SIGNING_KEY": "0a" * 32,
    "CHAIN_ID": "31337",
    "ORACLE_ADDRESS": ORACLE,
    "ORACLE_INDEX_SLUGS": "h100, a100",
}


def test_settings_load_and_normalise():
    s = load_settings(ENV)
    assert s.api_url == "https://api.example"
    assert s.signing_key == KEY
    assert s.slugs == ("h100", "a100")
    assert s.interval_seconds == 300


@pytest.mark.parametrize(
    ("name", "value", "message"),
    [
        ("SIGNING_KEY", "not-a-key", "32 bytes of hex"),
        ("ORACLE_ADDRESS", "0x123", "not an address"),
        ("CHAIN_ID", "abc", "must be an integer"),
        ("ORACLE_INDEX_SLUGS", " , ", "at least one"),
        ("ORACLE_INTERVAL_SECONDS", "10", "at least 60"),
        ("API_URL", "", "API_URL is not set"),
    ],
)
def test_bad_settings_fail_clearly(name, value, message):
    with pytest.raises(ConfigError, match=message):
        load_settings({**ENV, name: value})


def test_a_bad_key_is_not_echoed():
    with pytest.raises(ConfigError) as error:
        load_settings({**ENV, "SIGNING_KEY": "secret-value"})
    assert "secret-value" not in str(error.value)
