"""Reference model of the SiliquaOracle aggregation, docs/spec/oracle-v1.md section 7.

Integer arithmetic only. The Solidity contract must give the same result for every case in
test-vectors/oracle-aggregation-v1.json; this model is how the vectors are checked without
the contract.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from siliqua_index.gri import median

BPS = 10_000
# Keeps `abs(x - m) * BPS` and sums of two values far below 2**256 in the contract.
MAX_VALUE = 2**128 - 1


@dataclass(frozen=True)
class OracleResult:
    # Median of all submitted values before the outlier filter.
    median: int
    kept: tuple[int, ...]
    dropped: tuple[int, ...]
    # None when fewer than min_values survive: the slot is not finalized by this evidence.
    value: int | None


def aggregate(values: Sequence[int], tolerance_bps: int = 100, min_values: int = 2) -> OracleResult:
    if not values:
        raise ValueError("aggregate needs at least one value")
    if tolerance_bps < 0 or min_values < 1:
        raise ValueError(f"bad parameters: tolerance_bps={tolerance_bps}, min_values={min_values}")
    for value in values:
        if type(value) is not int or not 0 < value <= MAX_VALUE:
            raise ValueError(f"value must be an integer in 1..2**128-1, got {value!r}")

    ordered = sorted(values)
    center = median(ordered)
    kept = tuple(x for x in ordered if abs(x - center) * BPS <= center * tolerance_bps)
    dropped = tuple(x for x in ordered if abs(x - center) * BPS > center * tolerance_bps)
    value = median(list(kept)) if len(kept) >= min_values else None
    return OracleResult(median=center, kept=kept, dropped=dropped, value=value)
