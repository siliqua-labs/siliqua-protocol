"""Hourly GRI value, docs/methodology/gri-v1.0.md section 4.

Quotes are integer micro-USD per GPU-hour. No floats: the outlier bound
3 * max(1.4826 * MAD, 1% of median) is compared as an exact integer inequality.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from siliqua_index.rounding import div_half_up

MAD_SCALE = 14826
SCALE_DENOMINATOR = 10_000
FLOOR_PER_10K = 100
OUTLIER_FACTOR = 3


@dataclass(frozen=True)
class Methodology:
    min_valid_sources: int
    weight: Callable[[int], int]


METHODOLOGIES = {
    "1.0": Methodology(min_valid_sources=5, weight=lambda quote: 1),
}


@dataclass(frozen=True)
class GriResult:
    value: int | None
    valid_sources: int
    kept: tuple[str, ...]
    dropped: tuple[str, ...]


def median(values: list[int]) -> int:
    if not values:
        raise ValueError("median of an empty list")
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return div_half_up(ordered[middle - 1] + ordered[middle], 2)


def gri(quotes: Mapping[str, int], methodology_version: str = "1.0") -> GriResult:
    """Return the hour's value, or value None when fewer than the minimum sources survive."""
    if methodology_version not in METHODOLOGIES:
        raise ValueError(f"unknown methodology version {methodology_version!r}")
    methodology = METHODOLOGIES[methodology_version]
    for source, quote in quotes.items():
        if type(quote) is not int or quote <= 0:
            raise ValueError(f"quote for {source!r} must be a positive integer, got {quote!r}")
    if not quotes:
        return GriResult(value=None, valid_sources=0, kept=(), dropped=())

    sources = sorted(quotes)
    center = median([quotes[s] for s in sources])
    mad = median([abs(quotes[s] - center) for s in sources])
    limit = OUTLIER_FACTOR * max(MAD_SCALE * mad, FLOOR_PER_10K * center)
    kept = tuple(s for s in sources if abs(quotes[s] - center) * SCALE_DENOMINATOR <= limit)
    dropped = tuple(s for s in sources if s not in kept)

    if len(kept) < methodology.min_valid_sources:
        return GriResult(value=None, valid_sources=len(kept), kept=kept, dropped=dropped)

    weights = [methodology.weight(quotes[s]) for s in kept]
    weighted_sum = sum(w * quotes[s] for w, s in zip(weights, kept, strict=True))
    value = div_half_up(weighted_sum, sum(weights))
    return GriResult(value=value, valid_sources=len(kept), kept=kept, dropped=dropped)
