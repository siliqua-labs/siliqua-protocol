"""The fixture is the recorded pricing page (2026-11-23) with script, style and svg removed."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from price_collectors.providers import lambda_labs

PAGE = (Path(__file__).parent / "fixtures" / "lambda_pricing_recorded.html").read_text(
    encoding="utf-8"
)
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def parse(html: str):
    return lambda_labs.parse(html.encode("utf-8"), NOW)


def plan(name, vram, price, vcpus=104):
    return (
        f"<tr><td>{name}</td><td>{vram} GB</td><td>{vcpus}</td><td>900 GiB</td>"
        f"<td>11 TiB SSD</td><td>${price}</td></tr>"
    )


def section(*rows):
    return f"<h2>Instances pricing</h2><table>{''.join(rows)}</table>"


def test_recorded_page_gives_the_three_classes_lambda_sells():
    prices = {o.gpu_class: o.price_micro_usd for o in parse(PAGE)}
    assert prices == {"h100": 4_590_000, "b200": 7_690_000, "a100": 3_190_000}


def test_single_gpu_tiers_are_not_read_so_a_class_has_one_configuration():
    html = section(
        plan("NVIDIA B200 SXM6", 180, "7.99"),
        plan("NVIDIA H100 SXM", 80, "4.89"),
        plan("NVIDIA B200 SXM6", 180, "7.79"),
        plan("NVIDIA HGX H100", 80, "4.59"),
    )
    assert {o.gpu_class: o.price_micro_usd for o in parse(html)} == {"h100": 4_590_000}


def test_cluster_tables_are_reserved_capacity_and_not_read():
    clusters = (
        "<table><tr><td>NVIDIA H100</td><td>2 weeks – 1 year</td><td>16</td><td>$6.16</td></tr>"
        "</table>"
    )
    html = clusters + section(plan("NVIDIA HGX H100", 80, "4.59"))
    assert [o.price_micro_usd for o in parse(html)] == [4_590_000]


@pytest.mark.parametrize(
    "excluded",
    [plan("NVIDIA A100 PCIe", 40, "1.99"), plan("NVIDIA HGX A100", 40, "1.99")],
)
def test_pcie_and_the_40gb_a100_are_not_the_sku(excluded):
    observations = parse(section(excluded, plan("NVIDIA HGX H100", 80, "4.59")))
    assert [o.gpu_class for o in observations] == ["h100"]


def test_conflicting_duplicate_prices_fail():
    html = section(plan("NVIDIA HGX H100", 80, "4.59"), plan("NVIDIA HGX H100", 80, "4.80"))
    with pytest.raises(ValueError, match="two different prices"):
        parse(html)


def test_a_changed_row_layout_fails_clearly():
    html = "<h2>Instances pricing</h2><p>NVIDIA H100 SXM</p><p>80 GB</p><p>$4.69</p>"
    with pytest.raises(ValueError, match="layout changed"):
        parse(html)


def test_missing_section_fails():
    with pytest.raises(ValueError, match="no 'Instances pricing' section"):
        parse("<p>maintenance</p>")


def test_section_without_plans_fails():
    with pytest.raises(ValueError, match="no HGX plans"):
        parse("<h2>Instances pricing</h2><p>coming soon</p>")
