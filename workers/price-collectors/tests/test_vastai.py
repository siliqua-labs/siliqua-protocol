"""The fixture is a recorded live response (2026-11-23), trimmed to the fields the parser uses
with host addresses removed. The synthetic payloads below use round numbers."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import vastai

RECORDED = (Path(__file__).parent / "fixtures" / "vastai_offers_recorded.json").read_bytes()
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def offer(**overrides):
    base = {
        "id": 1,
        "gpu_name": "H100 SXM",
        "gpu_ram": 81559,
        "num_gpus": 1,
        "dph_base": 2.0,
        "dph_total": 2.002,
        "min_bid": 1.0,
        "reliability": 0.99,
        "verification": "verified",
        "rentable": True,
        "rented": False,
        "is_bid": False,
    }
    return base | overrides


def payload(*offers, truncated=False):
    return json.dumps({"offers": list(offers), "truncated": truncated}).encode()


def quotes(*offers):
    return {o.gpu_class: o.price_micro_usd for o in vastai.parse(payload(*offers), NOW)}


def test_recorded_response_gives_all_five_classes():
    observations = vastai.parse(RECORDED, NOW)
    prices = {o.gpu_class: o.price_micro_usd for o in observations}
    assert set(prices) == {"h100", "h200", "b200", "a100", "4090"}
    assert all(100_000 < price < 20_000_000 for price in prices.values())
    assert {o.provider for o in observations} == {"vastai"}


def test_recorded_response_drops_the_40gb_a100_and_the_48gb_4090():
    body = json.loads(RECORDED)
    wanted = [
        o
        for o in body["offers"]
        if (o["gpu_name"], o["gpu_ram"]) not in {("A100 SXM4", 40960), ("RTX 4090", 49140)}
    ]
    assert quotes(*wanted) == {o.gpu_class: o.price_micro_usd for o in vastai.parse(RECORDED, NOW)}


def test_price_is_per_gpu_not_per_offer():
    assert quotes(offer(num_gpus=2, dph_base=3.0)) == {"h100": 1_500_000}


def test_class_quote_is_the_median_of_offers():
    prices = quotes(offer(dph_base=1.0), offer(dph_base=2.0), offer(dph_base=10.0))
    assert prices == {"h100": 2_000_000}


def test_even_count_median_rounds_half_up():
    assert quotes(offer(dph_base=1.0), offer(dph_base=1.000001)) == {"h100": 1_000_001}


@pytest.mark.parametrize(
    "bad",
    [
        {"gpu_ram": 40960, "gpu_name": "A100 SXM4"},
        {"gpu_ram": 49140, "gpu_name": "RTX 4090"},
        {"reliability": 0.94},
        {"rentable": False},
        {"rented": True},
        {"is_bid": True},
        {"verification": "unverified"},
        {"gpu_name": "RTX 5090"},
    ],
)
def test_unqualified_offers_are_ignored(bad):
    assert quotes(offer(**bad)) == {}


def test_reliability_at_the_threshold_is_kept():
    assert quotes(offer(reliability=0.95)) == {"h100": 2_000_000}


def test_truncated_result_fails():
    with pytest.raises(ValueError, match="truncated"):
        vastai.parse(payload(offer(), truncated=True), NOW)


def test_missing_field_fails_clearly():
    broken = offer()
    del broken["dph_base"]
    with pytest.raises(ValueError, match="schema changed"):
        vastai.parse(payload(broken), NOW)
