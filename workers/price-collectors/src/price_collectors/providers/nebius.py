"""Nebius public price page: https://nebius.com/prices

The public spot-price API covers preemptible prices only (docs.nebius.com/signup-billing/spot-prices),
so on-demand prices come from the server-rendered "NVIDIA GPU Instances" table, USD per
GPU-hour. robots.txt allows every path. Terms clause 2.8 bars derivative works of the Platform
and does not name price pages. Nebius has not confirmed index use in writing; the owner accepted
the risk on 2026-11-27. Off unless COLLECTOR_NEBIUS_ENABLED=true. Nebius lists no A100.
"""

import logging
import re
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.html_text import visible_text_tokens
from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "nebius"
API_KEY_ENV = None
PAGE_URL = "https://nebius.com/prices"

CLASS_BY_ROW = {
    "NVIDIA HGX B200": "b200",
    "NVIDIA HGX H200": "h200",
    "NVIDIA HGX H100": "h100",
}

# The table header: five cells, then one five-cell row per platform.
HEADER = ["Item", "vCPUs", "RAM, GB", "Preemptible, GPU-hour *", "On-demand, GPU-hour"]
PRICE = re.compile(r"^\$(\d+(?:\.\d+)?)$")

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(PAGE_URL, headers={"User-Agent": "price-collector/0.1"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    tokens = visible_text_tokens(payload.decode("utf-8"))
    prices = _on_demand_prices(tokens)
    missing = sorted(set(CLASS_BY_ROW) - set(prices))
    if missing:
        raise ValueError(f"nebius pricing layout changed: no on-demand price for {missing}")
    digest = payload_sha256(payload)
    observations = [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=price_to_micro_usd(prices[row]),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for row, gpu_class in CLASS_BY_ROW.items()
    ]
    log.info("nebius: %d priced rows, %d observations", len(prices), len(observations))
    return observations


def _on_demand_prices(tokens: list[str]) -> dict[str, Decimal]:
    start = next(
        (i for i in range(len(tokens) - len(HEADER) + 1) if tokens[i : i + len(HEADER)] == HEADER),
        None,
    )
    if start is None:
        raise ValueError("nebius pricing layout changed: NVIDIA GPU table header not found")
    prices: dict[str, Decimal] = {}
    position = start + len(HEADER)
    while position + 5 <= len(tokens) and tokens[position].startswith("NVIDIA"):
        name, _vcpus, _ram, _preemptible, on_demand = tokens[position : position + 5]
        match = PRICE.match(on_demand)
        # "Contact us" and "from $x" cells are not an exact on-demand price.
        if match is not None:
            if name in prices:
                raise ValueError(f"nebius lists {name!r} twice")
            prices[name] = Decimal(match.group(1))
        elif name in CLASS_BY_ROW:
            raise ValueError(f"nebius pricing layout changed at row {name!r}: {on_demand!r}")
        position += 5
    return prices
