from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from price_collectors.registry import PROVIDERS
from price_collectors.runner import ConfigError, collect_enabled

PAYLOAD = (Path(__file__).parent / "fixtures" / "runpod_catalog_recorded.json").read_bytes()
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)
ENABLED = {"COLLECTOR_RUNPOD_ENABLED": "true", "RUNPOD_API_KEY": "test-key"}


def client_returning(response: httpx.Response, calls: list[httpx.Request]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return response

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_provider_is_off_unless_enabled():
    calls = []
    client = client_returning(httpx.Response(200, content=PAYLOAD), calls)
    assert collect_enabled(PROVIDERS, {"RUNPOD_API_KEY": "test-key"}, client, NOW) == []
    assert calls == []


def test_enabled_provider_without_key_fails_the_run():
    client = client_returning(httpx.Response(200, content=PAYLOAD), [])
    with pytest.raises(ConfigError, match="RUNPOD_API_KEY"):
        collect_enabled(PROVIDERS, {"COLLECTOR_RUNPOD_ENABLED": "true"}, client, NOW)


def test_enabled_provider_returns_observations_and_sends_the_key():
    calls = []
    client = client_returning(httpx.Response(200, content=PAYLOAD), calls)
    [result] = collect_enabled(PROVIDERS, ENABLED, client, NOW)
    assert result.error is None
    assert len(result.observations) == 5
    assert calls[0].headers["Authorization"] == "Bearer test-key"


def test_http_failure_is_recorded_not_raised():
    client = client_returning(httpx.Response(429, content=b"slow down"), [])
    [result] = collect_enabled(PROVIDERS, ENABLED, client, NOW)
    assert result.observations == ()
    assert "429" in result.error


def test_malformed_body_is_recorded_not_raised():
    client = client_returning(httpx.Response(200, content=b"<html>"), [])
    [result] = collect_enabled(PROVIDERS, ENABLED, client, NOW)
    assert result.observations == ()
    assert result.error is not None
