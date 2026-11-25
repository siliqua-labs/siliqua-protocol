"""Verda (formerly DataCrunch) instance types: https://api.verda.com/v1/docs

GET /v1/instance-types is a public endpoint (no key; the API changelog of 2026-03-19 says so).
Each type lists `location_prices` with the on-demand `price_per_hour`. Only single-GPU
instances are read, so the price is per GPU without dividing, and only the SXM models of the
v1 classes: confidential-computing variants (`CC`) and other memory sizes are different
products. A location price is listed whether or not stock exists (availability is a separate
endpoint), and the collector reduces locations to their median.

The terms read so far (clauses 1 to 8.4) do not bar automated retrieval of prices, but clause
3.3 makes the pricing page their intellectual property: off unless COLLECTOR_VERDA_ENABLED=true
and internal testing until Verda confirms index use in writing.
"""

import json
import logging
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "verda"
API_KEY_ENV = None
INSTANCE_TYPES_URL = "https://api.verda.com/v1/instance-types"

GPU_CLASS_BY_NAME = {
    "B200 SXM6 180GB": "b200",
    "H200 SXM5 141GB": "h200",
    "H100 SXM5 80GB": "h100",
    "A100 SXM4 80GB": "a100",
}

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(INSTANCE_TYPES_URL)
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    # parse_float=Decimal keeps prices exact; the API sends them as strings, this guards a change.
    body = json.loads(payload, parse_float=Decimal)
    digest = payload_sha256(payload)
    prices: dict[str, list[Decimal]] = {}
    try:
        for instance in body:
            gpu_class = GPU_CLASS_BY_NAME.get(instance["name"])
            if gpu_class is None or instance["gpu"]["number_of_gpus"] != 1:
                continue
            if instance["currency"] != "usd":
                raise ValueError(f"currency is {instance['currency']!r}, expected 'usd'")
            for location in instance["location_prices"]:
                prices.setdefault(gpu_class, []).append(Decimal(location["price_per_hour"]))
    except (KeyError, TypeError, ArithmeticError) as exc:
        raise ValueError(f"verda instance-types schema changed: {exc!r}") from exc
    observations = [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=price_to_micro_usd(_median(values)),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for gpu_class, values in sorted(prices.items())
    ]
    log.info("verda: %d observations", len(observations))
    return observations


def _median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2
