"""Texel marketplace page: https://texel.run/marketplace

Texel has no price API. `GET /api/v1/gpus` lists open GPU ids only, and robots.txt disallows
/api/ for crawlers, so this reads the public page. No terms page was found (docs/sources.md);
off unless COLLECTOR_TEXEL_ENABLED=true.

Each listing is "<name> | <n> GB VRAM | Listed at | $x | on Texel | $y | /hr". The quote is
the listed price, not the Texel price: the Texel price is a launch discount that will end and
would make the series jump. Owner to confirm.
"""

import logging
import re
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.html_text import visible_text_tokens
from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "texel"
API_KEY_ENV = None
PAGE_URL = "https://texel.run/marketplace"

# (listing name, VRAM in GB) -> class. SXM only; PCIe and NVL variants are left out (PLAN B1).
CLASS_BY_LISTING = {
    ("H100 SXM", 80): "h100",
    ("H200 SXM", 141): "h200",
    ("B200", 180): "b200",
    ("A100 SXM", 80): "a100",
    ("RTX 4090", 24): "4090",
}

VRAM = re.compile(r"^(\d+) GB VRAM$")
PRICE = re.compile(r"^\$(\d+(?:\.\d+)?)$")

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(PAGE_URL, headers={"User-Agent": "price-collector/0.1"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    tokens = visible_text_tokens(payload.decode("utf-8"))
    listed: dict[tuple[str, int], Decimal] = {}
    for position, token in enumerate(tokens):
        vram = VRAM.match(token)
        if vram is None:
            continue
        window = tokens[position + 1 : position + 6]
        if (
            len(window) < 5
            or window[0] != "Listed at"
            or not PRICE.match(window[1])
            or window[2] != "on Texel"
            or not PRICE.match(window[3])
            or window[4] != "/hr"
        ):
            raise ValueError(f"texel marketplace layout changed near {tokens[position - 1]!r}")
        name = tokens[position - 1]
        if name == "Lowest price":
            name = tokens[position - 2]
        key = (name, int(vram.group(1)))
        price = Decimal(PRICE.match(window[1]).group(1))
        # The page lists each GPU twice (featured and full list). The two must agree.
        if listed.setdefault(key, price) != price:
            raise ValueError(f"texel lists {key} at two different prices")
    if not listed:
        raise ValueError("texel marketplace layout changed: no listings found")

    digest = payload_sha256(payload)
    observations = [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=price_to_micro_usd(listed[key]),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for key, gpu_class in CLASS_BY_LISTING.items()
        if key in listed
    ]
    log.info("texel: %d listings, %d observations", len(listed), len(observations))
    return observations
