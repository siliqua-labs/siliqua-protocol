"""RunPod GPU catalog: https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types.md

Uses the Secure cloud list price, USD per hour for a single GPU. Community cloud is
peer-hosted and left out of v1.
"""

import json
import logging
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "runpod"
API_KEY_ENV = "RUNPOD_API_KEY"
CATALOG_URL = "https://api.runpod.io/v2/catalog/gpus"

# Exact ids from https://docs.runpod.io/references/gpu-types. PCIe, NVL and other
# variants are excluded in v1 (PLAN B1). The H100 id does not say SXM; the docs list it
# as "H100 SXM". A100 80GB maps to the SXM4 entry only.
GPU_CLASS_BY_ID = {
    "NVIDIA H100 80GB HBM3": "h100",
    "NVIDIA H200": "h200",
    "NVIDIA B200": "b200",
    "NVIDIA A100-SXM4-80GB": "a100",
    "NVIDIA GeForce RTX 4090": "4090",
}

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str) -> bytes:
    response = client.get(CATALOG_URL, headers={"Authorization": f"Bearer {api_key}"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    # parse_float=Decimal keeps prices exact; a float would never reach the index path.
    body = json.loads(payload, parse_float=Decimal)
    digest = payload_sha256(payload)
    observations = []
    ignored = 0
    try:
        for gpu in body["gpus"]:
            gpu_class = GPU_CLASS_BY_ID.get(gpu["id"])
            if gpu_class is None or not gpu["secure"]:
                ignored += 1
                continue
            price = gpu["price"]["secure"]
            if isinstance(price, bool) or not isinstance(price, int | Decimal):
                raise TypeError(f"price.secure for {gpu['id']!r} is not a number: {price!r}")
            observations.append(
                Observation(
                    provider=NAME,
                    gpu_class=gpu_class,
                    price_micro_usd=price_to_micro_usd(Decimal(price)),
                    observed_at=observed_at,
                    payload_sha256=digest,
                )
            )
    except (KeyError, TypeError) as exc:
        raise ValueError(f"runpod catalog schema changed: {exc!r}") from exc
    log.info("runpod: %d observations, %d gpus ignored", len(observations), ignored)
    return observations
