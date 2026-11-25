import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import verda

NOW = datetime(2026, 11, 25, 10, 0, tzinfo=UTC)
RECORDED = (Path(__file__).parent / "fixtures" / "verda_instance_types_recorded.json").read_bytes()


def prices(raw):
    return {o.gpu_class: o.price_micro_usd for o in verda.parse(raw, NOW)}


def test_recorded_payload_gives_the_median_location_price_per_gpu():
    # B200 locations 9.844, 9.844, 9.508; H200 7.184, 6.701, 6.701; the two H100 types and the
    # A100 40GB, 8x, CC, B300 and L40S entries must not change anything.
    assert prices(RECORDED) == {
        "b200": 9_844_000,
        "h200": 6_701_000,
        "h100": 5_241_000,
        "a100": 2_386_000,
    }


def test_even_number_of_locations_rounds_half_up():
    instance = {
        "name": "B200 SXM6 180GB",
        "currency": "usd",
        "gpu": {"number_of_gpus": 1},
        "location_prices": [{"price_per_hour": "1.000001"}, {"price_per_hour": "1.000002"}],
    }
    assert prices(json.dumps([instance]).encode()) == {"b200": 1_000_002}


def test_eight_gpu_and_confidential_variants_are_ignored():
    raw = json.dumps(
        [
            {
                "name": "B200 SXM6 180GB",
                "currency": "usd",
                "gpu": {"number_of_gpus": 8},
                "location_prices": [{"price_per_hour": "78.75"}],
            },
            {
                "name": "B200 CC SXM6 180GB",
                "currency": "usd",
                "gpu": {"number_of_gpus": 1},
                "location_prices": [{"price_per_hour": "10.04"}],
            },
        ]
    ).encode()
    assert prices(raw) == {}


def test_other_currency_is_an_error():
    instance = {
        "name": "B200 SXM6 180GB",
        "currency": "eur",
        "gpu": {"number_of_gpus": 1},
        "location_prices": [{"price_per_hour": "9"}],
    }
    with pytest.raises(ValueError, match="currency"):
        verda.parse(json.dumps([instance]).encode(), NOW)


def test_missing_field_is_a_schema_error():
    with pytest.raises(ValueError, match="schema changed"):
        verda.parse(json.dumps([{"name": "B200 SXM6 180GB"}]).encode(), NOW)
