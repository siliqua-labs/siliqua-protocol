from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import nebius

NOW = datetime(2026, 11, 25, 10, 0, tzinfo=UTC)
RECORDED = (Path(__file__).parent / "fixtures" / "nebius_prices_recorded.html").read_bytes()


def table(*rows):
    cells = ["Item", "vCPUs", "RAM, GB", "Preemptible, GPU-hour *", "On-demand, GPU-hour"]
    for row in rows:
        cells += row
    return "".join(f"<div><p>{c}</p></div>" for c in cells).encode()


def prices(raw):
    return {o.gpu_class: o.price_micro_usd for o in nebius.parse(raw, NOW)}


def test_recorded_page_gives_on_demand_prices_for_three_classes():
    assert prices(RECORDED) == {"b200": 8_500_000, "h200": 5_400_000, "h100": 4_500_000}


def test_contact_us_and_from_prices_are_not_read_as_prices():
    raw = table(
        ["NVIDIA GB200 NVL72", "112", "800", "-", "Contact us"],
        ["NVIDIA HGX B200", "20", "224", "from $0.99", "$8.50"],
        ["NVIDIA HGX H200", "16", "200", "from $0.79", "$5.40"],
        ["NVIDIA HGX H100", "16", "200", "from $0.79", "$4.50"],
        ["NVIDIA L40S with Intel CPU", "8-40", "32-160", "from $0.74**", "from $1.55"],
    )
    assert prices(raw) == {"b200": 8_500_000, "h200": 5_400_000, "h100": 4_500_000}


def test_missing_class_row_is_an_error():
    raw = table(["NVIDIA HGX B200", "20", "224", "from $0.99", "$8.50"])
    with pytest.raises(ValueError, match="no on-demand price"):
        nebius.parse(raw, NOW)


def test_class_row_without_a_price_is_an_error():
    raw = table(["NVIDIA HGX B200", "20", "224", "-", "Contact us"])
    with pytest.raises(ValueError, match="layout changed"):
        nebius.parse(raw, NOW)


def test_changed_header_is_an_error():
    with pytest.raises(ValueError, match="header not found"):
        nebius.parse(b"<p>NVIDIA HGX B200</p>", NOW)
