"""SaladCloud public pricing page: https://salad.com/pricing

USD per GPU-hour, vCPU and RAM included, by priority tier. The page says higher tiers are
protected from preemption by other workloads and Lowest is the most interruptible, so v1 uses
the High tier as the closest to an on-demand price. The tier choice is a methodology decision
(docs/sources.md). Salad rents consumer GPUs, so only RTX 4090 maps to a v1 class.
robots.txt allows the page. No terms page was read: off unless COLLECTOR_SALAD_ENABLED=true.
"""

import logging
import re
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.html_text import visible_text_tokens
from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "salad"
API_KEY_ENV = None
PAGE_URL = "https://salad.com/pricing"

# (name on the page, VRAM in GB) -> class.
CLASS_BY_ROW = {("RTX 4090", 24): "4090"}

# The GPU instances table: this header, then one seven-cell row per GPU. Columns after the
# VRAM are the High, Medium, Low and Lowest tiers, then the monthly price at Lowest.
HEADER = ["GPU", "VRAM", "High", "Medium", "Low", "Lowest", "$/mo (Lowest)"]
VRAM = re.compile(r"^(\d+) GB$")
PRICE = re.compile(r"^\$(\d+(?:\.\d+)?)$")
ROW_CELLS = 7

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(
        PAGE_URL, headers={"User-Agent": "price-collector/0.1"}, follow_redirects=True
    )
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    rows = _high_tier_prices(visible_text_tokens(payload.decode("utf-8")))
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
    log.info("salad: %d priced rows, %d observations", len(rows), len(observations))
    return observations


def _high_tier_prices(tokens: list[str]) -> dict[tuple[str, int], Decimal]:
    start = next(
        (i for i in range(len(tokens) - len(HEADER) + 1) if tokens[i : i + len(HEADER)] == HEADER),
        None,
    )
    if start is None:
        raise ValueError("salad pricing layout changed: GPU instances header not found")
    rows: dict[tuple[str, int], Decimal] = {}
    position = start + len(HEADER)
    while position + ROW_CELLS <= len(tokens):
        name, vram, *tiers = tokens[position : position + ROW_CELLS]
        vram_match = VRAM.match(vram)
        if vram_match is None:
            break
        prices = [PRICE.match(cell) for cell in tiers]
        if any(price is None for price in prices):
            raise ValueError(f"salad pricing layout changed at row {name!r}")
        high, medium, low, lowest, _monthly = (Decimal(price.group(1)) for price in prices)
        # Columns run High to Lowest and cost falls along them; a row out of that order
        # means the columns moved and High would be the wrong cell.
        if not high >= medium >= low >= lowest:
            raise ValueError(f"salad tiers for {name!r} are not in descending order")
        key = (name, int(vram_match.group(1)))
        if rows.setdefault(key, high) != high:
            raise ValueError(f"salad lists {key} at two different prices")
        position += ROW_CELLS
    if not rows:
        raise ValueError("salad pricing layout changed: no GPU rows after the header")
    return rows
