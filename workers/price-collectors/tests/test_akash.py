"""The fixture is the recorded pricing page (read 2026-11-23, prices updated 2026-11-20) with
script, style and svg removed."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import akash

PAGE = (Path(__file__).parent / "fixtures" / "akash_gpu_pricing_recorded.html").read_text(
    encoding="utf-8"
)
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def parse(html: str, now: datetime = NOW):
    return akash.parse(html.encode("utf-8"), now)


def row(name, vram, interface, price):
    return f"<tr><td>{name}</td><td>{vram} GB</td><td>{interface}</td><td>${price}</td><td>/hr</td></tr>"


def page(*rows, updated="November 20, 2026"):
    return f"<p>Prices updated</p><p>{updated}</p><table>{''.join(rows)}</table>"


def test_recorded_page_gives_the_three_priced_classes():
    prices = {o.gpu_class: o.price_micro_usd for o in parse(PAGE)}
    assert prices == {"h100": 2_730_000, "a100": 1_670_000, "4090": 360_000}


def test_the_40gb_a100_is_not_the_sku():
    html = page(row("A100", 40, "SXM4", "0.84"), row("A100", 80, "SXM4", "1.67"))
    assert {o.gpu_class: o.price_micro_usd for o in parse(html)} == {"a100": 1_670_000}


def test_conflicting_duplicate_prices_fail():
    html = page(row("H100", 80, "SXM5", "2.73"), row("H100", 80, "SXM5", "2.80"))
    with pytest.raises(ValueError, match="two different prices"):
        parse(html)


def test_stale_page_fails():
    later = datetime(2026, 11, 28, 10, 0, tzinfo=UTC)
    with pytest.raises(ValueError, match="stale"):
        parse(PAGE, later)


def test_page_one_week_old_is_still_accepted():
    edge = datetime(2026, 11, 27, 10, 0, tzinfo=UTC)
    assert parse(PAGE, edge)


def test_missing_update_date_fails():
    with pytest.raises(ValueError, match="Prices updated"):
        parse(f"<table>{row('H100', 80, 'SXM5', '2.73')}</table>")


def test_date_in_the_future_fails():
    with pytest.raises(ValueError, match="future"):
        parse(page(row("H100", 80, "SXM5", "2.73"), updated="December 20, 2026"))


def test_a_price_outside_the_row_layout_fails_clearly():
    with pytest.raises(ValueError, match="layout changed"):
        parse(page("<p>H100</p><p>$2.73</p><p>/hr</p>"))
