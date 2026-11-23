"""TensorDock locations: https://dashboard.tensordock.com/api/docs/fetch-hostnodes

GET /api/v2/locations lists each location's GPU models with `price_per_hr` (per GPU; vCPU,
RAM and storage are charged separately). A marketplace shows one price per location, so the
collector reduces them to the median across locations that have stock.

Only the two model ids shown in the official docs are mapped. Other ids are logged by
parse() so they can be mapped after a live call with a key; none are guessed. The website
terms (section 5.2) bar scraping and republishing and do not name the API: off unless
COLLECTOR_TENSORDOCK_ENABLED=true.
"""

import json
import logging
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "tensordock"
API_KEY_ENV = "TENSORDOCK_API_KEY"
LOCATIONS_URL = "https://dashboard.tensordock.com/api/v2/locations"

GPU_CLASS_BY_V0_NAME = {
    "h100-sxm5-80gb": "h100",
    "geforcertx4090-pcie-24gb": "4090",
}

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str) -> bytes:
    response = client.get(LOCATIONS_URL, headers={"Authorization": f"Bearer {api_key}"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    # parse_float=Decimal keeps prices exact; a float would never reach the index path.
    body = json.loads(payload, parse_float=Decimal)
    digest = payload_sha256(payload)
    prices: dict[str, list[Decimal]] = {}
    unmapped: set[str] = set()
    try:
        for location in body["data"]["locations"]:
            for gpu in location["gpus"]:
                gpu_class = GPU_CLASS_BY_V0_NAME.get(gpu["v0Name"])
                if gpu_class is None:
                    unmapped.add(gpu["v0Name"])
                    continue
                if gpu["max_count"] <= 0:
                    continue
                price = gpu["price_per_hr"]
                if isinstance(price, bool) or not isinstance(price, int | Decimal):
                    raise TypeError(
                        f"price_per_hr for {gpu['v0Name']!r} is not a number: {price!r}"
                    )
                prices.setdefault(gpu_class, []).append(Decimal(price))
    except (KeyError, TypeError) as exc:
        raise ValueError(f"tensordock locations schema changed: {exc!r}") from exc
    observations = [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=price_to_micro_usd(_median(values)),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for gpu_class, values in prices.items()
    ]
    log.info(
        "tensordock: %d observations, unmapped model ids: %s",
        len(observations),
        sorted(unmapped) or "none",
    )
    return observations


def _median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2
