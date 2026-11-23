"""The fixture is the recorded public pricing page (read 2026-11-23) with script, style and
svg removed."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import salad

PAGE = (Path(__file__).parent / "fixtures" / "salad_pricing_recorded.html").read_text(
    encoding="utf-8"
)
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)
HEADER = "".join(f"<th>{cell}</th>" for cell in salad.HEADER)


def parse(html: str):
    return salad.parse(html.encode("utf-8"), NOW)


def row(name, vram, high, medium, low, lowest, monthly="116.80"):
    cells = [name, f"{vram} GB", f"${high}", f"${medium}", f"${low}", f"${lowest}", f"${monthly}"]
    return "<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr>"


def page(*rows):
    return f"<table><tr>{HEADER}</tr>{''.join(rows)}</table>"


def test_recorded_page_gives_4090_at_the_high_tier():
    assert {o.gpu_class: o.price_micro_usd for o in parse(PAGE)} == {"4090": 440_000}


def test_other_vram_is_not_the_sku():
    html = page(row("RTX 4090", 48, "0.90", "0.80", "0.70", "0.60"))
    assert parse(html) == []


def test_other_gpus_are_ignored():
    html = page(row("RTX 5090", 32, "0.600", "0.483", "0.367", "0.250"))
    assert parse(html) == []


def test_conflicting_duplicate_prices_fail():
    html = page(
        row("RTX 4090", 24, "0.440", "0.347", "0.253", "0.160"),
        row("RTX 4090", 24, "0.450", "0.347", "0.253", "0.160"),
    )
    with pytest.raises(ValueError, match="two different prices"):
        parse(html)


def test_tiers_out_of_order_fail_clearly():
    html = page(row("RTX 4090", 24, "0.160", "0.253", "0.347", "0.440"))
    with pytest.raises(ValueError, match="descending order"):
        parse(html)


def test_missing_header_fails_clearly():
    with pytest.raises(ValueError, match="header not found"):
        parse("<p>RTX 4090</p><p>$0.440</p>")


def test_a_row_without_a_price_fails_clearly():
    html = page(row("RTX 4090", 24, "0.440", "0.347", "0.253", "Contact us"))
    with pytest.raises(ValueError, match="layout changed at row"):
        parse(html)


def test_header_with_no_rows_fails_clearly():
    with pytest.raises(ValueError, match="no GPU rows"):
        parse(page())
