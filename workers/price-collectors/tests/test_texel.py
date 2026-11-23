"""The fixture is the recorded marketplace page (2026-11-23) with script, style and svg removed."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import texel

PAGE = (Path(__file__).parent / "fixtures" / "texel_marketplace_recorded.html").read_text(
    encoding="utf-8"
)
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def parse(html: str):
    return texel.parse(html.encode("utf-8"), NOW)


def listing(name, vram, listed="1.00", texel_price="0.70"):
    return (
        f"<div><h3>{name}</h3><p>{vram} GB VRAM</p><span>Listed at</span><b>${listed}</b>"
        f"<span>on Texel</span><b>${texel_price}</b><span>/hr</span><a>Rent</a></div>"
    )


def test_recorded_page_gives_the_listed_price_for_all_five_classes():
    prices = {o.gpu_class: o.price_micro_usd for o in parse(PAGE)}
    assert prices == {
        "h100": 3_990_000,
        "h200": 5_290_000,
        "b200": 7_990_000,
        "a100": 1_790_000,
        "4090": 890_000,
    }


def test_observation_carries_provider_time_and_hash():
    observations = parse(PAGE)
    assert {o.provider for o in observations} == {"texel"}
    assert {o.observed_at for o in observations} == {NOW}
    assert len({o.payload_sha256 for o in observations}) == 1


def test_pcie_and_other_vram_sizes_are_not_the_sku():
    html = listing("H100 PCIe", 80) + listing("A100 SXM", 40) + listing("H100 SXM", 80, "4.00")
    assert {o.gpu_class: o.price_micro_usd for o in parse(html)} == {"h100": 4_000_000}


def test_a_gpu_listed_twice_at_the_same_price_counts_once():
    html = listing("H100 SXM", 80, "4.00") + listing("H100 SXM", 80, "4.00")
    assert [o.price_micro_usd for o in parse(html)] == [4_000_000]


def test_conflicting_duplicate_prices_fail():
    html = listing("H100 SXM", 80, "4.00") + listing("H100 SXM", 80, "4.10")
    with pytest.raises(ValueError, match="two different prices"):
        parse(html)


def test_a_changed_listing_layout_fails_clearly():
    html = "<div><h3>H100 SXM</h3><p>80 GB VRAM</p><b>$4.00</b></div>"
    with pytest.raises(ValueError, match="layout changed"):
        parse(html)


def test_page_without_listings_fails():
    with pytest.raises(ValueError, match="no listings"):
        parse("<html><body><p>maintenance</p></body></html>")
