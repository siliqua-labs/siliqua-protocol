"""Hyperstack public GPU pricing page: https://www.hyperstack.cloud/gpu-pricing

The account pricebook API can include account discounts (docs/sources.md), so the collector
reads the public on-demand list price instead, USD per GPU-hour. robots.txt allows the page.
No terms clause on price data was found, but clause 6.4 bars derivative works without a
written agreement: off unless COLLECTOR_HYPERSTACK_ENABLED=true.
"""

import logging
import re
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.html_text import visible_text_tokens
from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "hyperstack"
API_KEY_ENV = None
PAGE_URL = "https://www.hyperstack.cloud/gpu-pricing"

# (name on the page, VRAM in GB) -> class. NVLink and PCIe variants are left out in v1.
CLASS_BY_ROW = {
    ("NVIDIA H100 SXM", 80): "h100",
    ("NVIDIA A100 SXM", 80): "a100",
    ("NVIDIA H200 SXM", 141): "h200",
    ("NVIDIA B200", 192): "b200",
}

# The on-demand GPU table: a header of these five cells, then one five-cell row per GPU.
HEADER = [
    "GPU Model",
    "VRAM (GB)",
    "Max pCPUs per GPU",
    "Max RAM (GB) per GPU",
    "Pricing Per Hour",
]
INTEGER = re.compile(r"^\d+$")
PRICE = re.compile(r"^\$(\d+(?:\.\d+)?)$")

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(PAGE_URL, headers={"User-Agent": "price-collector/0.1"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    tokens = visible_text_tokens(payload.decode("utf-8"))
    rows = _gpu_rows(tokens)
    digest = payload_sha256(payload)
    observations = [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=price_to_micro_usd(rows[key]),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for key, gpu_class in CLASS_BY_ROW.items()
        if key in rows
    ]
    log.info("hyperstack: %d priced rows, %d observations", len(rows), len(observations))
    return observations


def _gpu_rows(tokens: list[str]) -> dict[tuple[str, int], Decimal]:
    start = next(
        (i for i in range(len(tokens) - len(HEADER) + 1) if tokens[i : i + len(HEADER)] == HEADER),
        None,
    )
    if start is None:
        raise ValueError("hyperstack pricing layout changed: on-demand GPU header not found")
    rows: dict[tuple[str, int], Decimal] = {}
    position = start + len(HEADER)
    while position + 5 <= len(tokens):
        name, vram, pcpus, ram, price = tokens[position : position + 5]
        if not (name.startswith("NVIDIA") and INTEGER.match(vram)):
            break
        if not (INTEGER.match(pcpus) and INTEGER.match(ram)) or PRICE.match(price) is None:
            raise ValueError(f"hyperstack pricing layout changed at row {name!r}")
        key = (name, int(vram))
        value = Decimal(PRICE.match(price).group(1))
        if rows.setdefault(key, value) != value:
            raise ValueError(f"hyperstack lists {key} at two different prices")
        position += 5
    if not rows:
        raise ValueError("hyperstack pricing layout changed: no GPU rows after the header")
    return rows
