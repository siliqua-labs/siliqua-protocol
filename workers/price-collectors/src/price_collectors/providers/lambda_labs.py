"""Lambda on-demand instance prices from the public page https://lambda.com/pricing

The API (`GET /api/v1/instance-types`) needs a key and Lambda requires a payment method to issue
one, so this reads the public page. robots.txt does not disallow it. Prices are per GPU per hour,
before tax. The 1-Click Cluster tables are reserved capacity (2 weeks to 1 year, 16+ GPUs) and are
not read: only the "Instances pricing" section is.

That section has one table per GPU count (tabs 8x, 4x, 2x, 1x), and the per-GPU price differs by
count (B200 SXM6: 7.79, 7.89, 7.99). The tab order is inferred from the page, which gives no table
labels. The quote uses only the HGX plans, the 8-GPU boards: one consistent configuration that
covers all three classes Lambda sells. Lambda lists no H200 or RTX 4090.
Off unless COLLECTOR_LAMBDA_ENABLED=true.
"""

import logging
import re
from datetime import datetime
from decimal import Decimal

import httpx

from price_collectors.html_text import visible_text_tokens
from price_collectors.observation import Observation, payload_sha256, price_to_micro_usd

NAME = "lambda"
API_KEY_ENV = None
# The old path /service/gpu-cloud/pricing answers 301 to this one. Redirects are not followed, so
# a future move fails loudly instead of reading an unknown page.
PAGE_URL = "https://lambda.com/pricing"
SECTION_ANCHOR = "Instances pricing"

# (plan name, VRAM in GB) -> class. HGX boards are SXM. The 40GB A100 is not the SKU.
CLASS_BY_PLAN = {
    ("NVIDIA HGX H100", 80): "h100",
    ("NVIDIA HGX B200", 180): "b200",
    ("NVIDIA HGX A100", 80): "a100",
}

VRAM = re.compile(r"^(\d+) GB$")
VCPUS = re.compile(r"^\d+$")
RAM = re.compile(r"^[\d,]+ GiB$")
STORAGE = re.compile(r"^[\d.]+ [TG]iB SSD$")
PRICE = re.compile(r"^\$(\d+(?:\.\d+)?)$")

log = logging.getLogger(__name__)


def fetch(client: httpx.Client, api_key: str | None) -> bytes:
    response = client.get(PAGE_URL, headers={"User-Agent": "price-collector/0.1"})
    response.raise_for_status()
    return response.content


def parse(payload: bytes, observed_at: datetime) -> list[Observation]:
    tokens = visible_text_tokens(payload.decode("utf-8"))
    if SECTION_ANCHOR not in tokens:
        raise ValueError(f"lambda pricing layout changed: no {SECTION_ANCHOR!r} section")
    section = tokens[tokens.index(SECTION_ANCHOR) :]

    plans: dict[tuple[str, int], Decimal] = {}
    for position, token in enumerate(section):
        vram = VRAM.match(token)
        if vram is None or position == 0 or not section[position - 1].startswith("NVIDIA"):
            continue
        window = section[position + 1 : position + 5]
        if (
            len(window) < 4
            or not VCPUS.match(window[0])
            or not RAM.match(window[1])
            or not STORAGE.match(window[2])
            or not PRICE.match(window[3])
        ):
            raise ValueError(f"lambda pricing layout changed near {section[position - 1]!r}")
        key = (section[position - 1], int(vram.group(1)))
        if key not in CLASS_BY_PLAN:
            continue
        price = Decimal(PRICE.match(window[3]).group(1))
        if plans.setdefault(key, price) != price:
            raise ValueError(f"lambda lists {key} at two different prices")
    if not plans:
        raise ValueError("lambda pricing layout changed: no HGX plans found")

    digest = payload_sha256(payload)
    observations = [
        Observation(
            provider=NAME,
            gpu_class=gpu_class,
            price_micro_usd=price_to_micro_usd(plans[key]),
            observed_at=observed_at,
            payload_sha256=digest,
        )
        for key, gpu_class in CLASS_BY_PLAN.items()
        if key in plans
    ]
    log.info("lambda: %d plans, %d observations", len(plans), len(observations))
    return observations
