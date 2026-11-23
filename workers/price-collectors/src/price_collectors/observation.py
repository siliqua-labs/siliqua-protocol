import hashlib
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

MICRO = Decimal(1_000_000)


@dataclass(frozen=True)
class Observation:
    """One provider quote for one class, in integer micro-USD per GPU-hour."""

    provider: str
    gpu_class: str
    price_micro_usd: int
    observed_at: datetime
    payload_sha256: str


def price_to_micro_usd(price: Decimal) -> int:
    micro = int((price * MICRO).to_integral_value(rounding=ROUND_HALF_UP))
    if micro <= 0:
        raise ValueError(f"price must be positive, got {price}")
    return micro


def payload_sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()
