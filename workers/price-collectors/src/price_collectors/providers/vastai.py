"""Vast.ai marketplace: https://docs.vast.ai/api-reference/search/search-offers

Terms status: Vast.ai forbids building an index from this data without a written agreement
(docs/sources.md). There is none; the owner accepted the risk on 2026-11-27. The provider is
off unless COLLECTOR_VASTAI_ENABLED=true.

Many hosts list offers at their own prices, so the provider is one source: the quote for a
class is the median of its qualifying offers, in micro-USD per GPU-hour.
"""

import json
import logging
from datetime import datetime
from decimal import Decimal

import httpx
from siliqua_index import median

from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "vastai"
API_KEY_ENV = "VASTAI_API_KEY"
SEARCH_URL = "https://console.vast.ai/api/v0/bundles"

# gpu_name uses spaces ("H100 SXM"); underscores return nothing on the live API even though
# the docs say otherwise. VRAM bounds in MB separate SKUs that share a name: A100 SXM4 also
# comes as 40GB and RTX 4090 also as a 48GB variant. Bounds are wide around the sizes seen
# in a live response on 2026-11-23: 81559, 143771, 183359, 81920 and 24564.
CLASS_RULES = {
    "H100 SXM": ("h100", 79_000, 84_000),
    "H200": ("h200", 140_000, 147_000),
    "B200": ("b200", 180_000, 186_000),
    "A100 SXM4": ("a100", 80_000, 83_000),
    "RTX 4090": ("4090", 23_000, 25_000),
}

# "Reliable" is not defined in PLAN B1. The docs use 0.99 in one example; 0.95 keeps most
# verified offers so thin classes such as H100 SXM still have a sample. Owner to confirm.
MIN_RELIABILITY = Decimal("0.95")

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str) -> bytes:
    query = {
        "limit": 1000,
        "type": "ondemand",
        "verified": {"eq": True},
        "rentable": {"eq": True},
        "rented": {"eq": False},
        "gpu_name": {"in": list(CLASS_RULES)},
    }
    response = client.post(SEARCH_URL, json=query, headers={"Authorization": f"Bearer {api_key}"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    body = json.loads(payload, parse_float=Decimal)
    digest = payload_sha256(payload)
    prices_by_class: dict[str, list[int]] = {}
    ignored = 0
    try:
        # A cut-off list is biased toward whatever the server sorted first.
        if body["truncated"]:
            raise ValueError("search result is truncated, the sample is incomplete")
        for offer in body["offers"]:
            rule = CLASS_RULES.get(offer["gpu_name"])
            if rule is None or not _qualifies(offer, rule):
                ignored += 1
                continue
            # dph_base is the compute price of the whole offer. dph_total adds a small
            # storage charge (seen on live offers) and is not a GPU price. Neither is
            # defined in the docs; dph_base scaled exactly with num_gpus on live offers.
            per_gpu = Decimal(offer["dph_base"]) / offer["num_gpus"]
            prices_by_class.setdefault(rule[0], []).append(price_to_micro_usd(per_gpu))
    except (KeyError, TypeError) as exc:
        raise ValueError(f"vast.ai search schema changed: {exc!r}") from exc
    log.info("vastai: %d classes, %d offers ignored", len(prices_by_class), ignored)
    return [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=median(prices),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for gpu_class, prices in sorted(prices_by_class.items())
    ]


def _qualifies(offer: dict, rule: tuple[str, int, int]) -> bool:
    _, min_ram, max_ram = rule
    return (
        offer["verification"] == "verified"
        and offer["rentable"] is True
        and offer["rented"] is False
        and offer["is_bid"] is False
        and min_ram <= offer["gpu_ram"] <= max_ram
        and Decimal(offer["reliability"]) >= MIN_RELIABILITY
        and offer["num_gpus"] >= 1
        and Decimal(offer["dph_base"]) > 0
    )
