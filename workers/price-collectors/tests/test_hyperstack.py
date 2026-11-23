"""The fixture is the recorded public pricing page (read 2026-11-23) with script, style and
svg removed."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import hyperstack

PAGE = (Path(__file__).parent / "fixtures" / "hyperstack_gpu_pricing_recorded.html").read_text(
    encoding="utf-8"
)
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)
HEADER = "".join(f"<th>{cell}</th>" for cell in hyperstack.HEADER)


def parse(html: str):
    return hyperstack.parse(html.encode("utf-8"), NOW)


def row(name, vram, price, pcpus=24, ram=240):
    return f"<tr><td>{name}</td><td>{vram}</td><td>{pcpus}</td><td>{ram}</td><td>${price}</td></tr>"


def page(*rows):
    return f"<table><tr>{HEADER}</tr>{''.join(rows)}</table>"


def test_recorded_page_gives_the_four_sxm_classes():
    prices = {o.gpu_class: o.price_micro_usd for o in parse(PAGE)}
    assert prices == {"h200": 3_990_000, "h100": 3_200_000, "a100": 1_600_000, "b200": 6_000_000}


def test_nvlink_and_pcie_variants_are_not_the_sku():
    html = page(row("NVIDIA H100 NVLink", 80, "2.60"), row("NVIDIA H100 SXM", 80, "3.20"))
    assert {o.gpu_class: o.price_micro_usd for o in parse(html)} == {"h100": 3_200_000}


def test_the_40gb_vram_is_not_the_sku():
    assert parse(page(row("NVIDIA A100 SXM", 40, "1.00"))) == []


def test_conflicting_duplicate_prices_fail():
    html = page(row("NVIDIA B200", 192, "6.00"), row("NVIDIA B200", 192, "6.50"))
    with pytest.raises(ValueError, match="two different prices"):
        parse(html)


def test_missing_header_fails_clearly():
    with pytest.raises(ValueError, match="header not found"):
        parse("<p>NVIDIA H100 SXM</p><p>$3.20</p>")


def test_a_row_without_a_price_fails_clearly():
    html = page(
        "<tr><td>NVIDIA B200</td><td>192</td><td>31</td><td>256</td><td>Contact us</td></tr>"
    )
    with pytest.raises(ValueError, match="layout changed at row"):
        parse(html)


def test_header_with_no_rows_fails_clearly():
    with pytest.raises(ValueError, match="no GPU rows"):
        parse(page())
