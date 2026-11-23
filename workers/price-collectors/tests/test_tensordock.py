"""The payload mirrors the response shape in the official TensorDock docs for
GET /api/v2/locations. It is not a live recording: the endpoint needs an API key. Re-record
it once a key is in place."""

import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from price_collectors.providers import tensordock

NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def gpu(v0_name, price, max_count=4):
    return {"v0Name": v0_name, "max_count": max_count, "price_per_hr": price}


def payload(*locations):
    body = {
        "data": {
            "locations": [{"id": f"loc-{i}", "gpus": gpus} for i, gpus in enumerate(locations)]
        }
    }
    return json.dumps(body, default=str).encode()


def prices(raw):
    return {o.gpu_class: o.price_micro_usd for o in tensordock.parse(raw, NOW)}


def test_reduces_locations_to_the_median_price():
    raw = payload(
        [gpu("h100-sxm5-80gb", 2.2)],
        [gpu("h100-sxm5-80gb", 2.5)],
        [gpu("h100-sxm5-80gb", 3.0)],
    )
    assert prices(raw) == {"h100": 2_500_000}


def test_even_count_uses_the_mean_rounded_half_up():
    raw = payload([gpu("h100-sxm5-80gb", 2.2)], [gpu("h100-sxm5-80gb", 2.3)])
    assert prices(raw) == {"h100": 2_250_000}


def test_location_without_stock_is_not_a_rentable_price():
    raw = payload(
        [gpu("geforcertx4090-pcie-24gb", 0.2, max_count=0)],
        [gpu("geforcertx4090-pcie-24gb", 0.5)],
    )
    assert prices(raw) == {"4090": 500_000}


def test_unmapped_model_is_ignored_and_logged(caplog):
    caplog.set_level("INFO")
    raw = payload([gpu("a100-sxm4-80gb", 1.5), gpu("h100-sxm5-80gb", 2.2)])
    assert prices(raw) == {"h100": 2_200_000}
    assert "a100-sxm4-80gb" in caplog.text


def test_empty_locations_gives_no_observations():
    assert prices(payload()) == {}


def test_parse_fails_clearly_when_the_schema_changes():
    with pytest.raises(ValueError, match="schema changed"):
        tensordock.parse(json.dumps({"data": {}}).encode(), NOW)


def test_rejects_a_non_numeric_price():
    raw = payload([gpu("h100-sxm5-80gb", "2.2")])
    with pytest.raises(ValueError, match="not a number"):
        tensordock.parse(raw, NOW)


def test_prices_are_parsed_as_decimal_not_float():
    raw = b'{"data":{"locations":[{"gpus":[{"v0Name":"h100-sxm5-80gb","max_count":1,"price_per_hr":0.1}]}]}}'
    assert tensordock.parse(raw, NOW)[0].price_micro_usd == int(Decimal("0.1") * 1_000_000)
