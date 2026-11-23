"""Akash GPU pricing page: https://akash.network/pricing/gpus/

No price API exists (docs/sources.md). The page shows the average hourly price per GPU from
recent provider bids, weighted by GPU count, and is updated periodically, not hourly. Only
H100, A100 80GB and RTX 4090 have a price; B200 says "Request access" and H200 is absent.
No terms page was found; off unless COLLECTOR_AKASH_ENABLED=true.
"""

import logging
import re
from datetime import datetime, timedelta
from decimal import Decimal

import httpx

from price_collectors.html_text import visible_text_tokens
from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "akash"
API_KEY_ENV = None
PAGE_URL = "https://akash.network/pricing/gpus/"

# (model, interface, VRAM in GB) -> class.
CLASS_BY_ROW = {
    ("H100", "SXM5", 80): "h100",
    ("A100", "SXM4", 80): "a100",
    ("RTX 4090", "PCIe", 24): "4090",
}

# A page that stopped updating would be re-read as fresh every 10 minutes. Seven days is a
# proposal; the page was 3 days old when first read.
MAX_PAGE_AGE = timedelta(days=7)

VRAM = re.compile(r"^(\d+) GB$")
PRICE = re.compile(r"^\$(\d+(?:\.\d+)?)$")

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(PAGE_URL, headers={"User-Agent": "price-collector/0.1"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    tokens = visible_text_tokens(payload.decode("utf-8"))
    _check_page_age(tokens, observed_at)

    rows: dict[tuple[str, str, int], Decimal] = {}
    for position, token in enumerate(tokens):
        price = PRICE.match(token)
        if price is None or tokens[position + 1 : position + 2] != ["/hr"]:
            continue
        vram = VRAM.match(tokens[position - 2]) if position >= 4 else None
        if vram is None:
            raise ValueError(f"akash pricing layout changed near price {token!r}")
        interface = tokens[position - 1]
        name = tokens[position - 3]
        if name == "View specs":
            name = tokens[position - 4]
        key = (name, interface, int(vram.group(1)))
        value = Decimal(price.group(1))
        if rows.setdefault(key, value) != value:
            raise ValueError(f"akash lists {key} at two different prices")
    if not rows:
        raise ValueError("akash pricing layout changed: no priced rows found")

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
    log.info("akash: %d priced rows, %d observations", len(rows), len(observations))
    return observations


def _check_page_age(tokens: list[str], observed_at: datetime) -> None:
    if "Prices updated" not in tokens:
        raise ValueError("akash pricing layout changed: no 'Prices updated' date")
    label = tokens[tokens.index("Prices updated") + 1]
    try:
        updated = datetime.strptime(label, "%B %d, %Y").date()
    except ValueError as exc:
        raise ValueError(f"akash 'Prices updated' date not understood: {label!r}") from exc
    age = observed_at.date() - updated
    if age > MAX_PAGE_AGE:
        raise ValueError(f"akash prices are stale: updated {updated}, read {observed_at.date()}")
    if updated > observed_at.date() + timedelta(days=1):
        raise ValueError(f"akash 'Prices updated' is in the future: {updated}")
