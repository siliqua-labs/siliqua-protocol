"""TWAP over hourly GRI, docs/methodology/gri-v1.0.md section 7."""

from collections.abc import Sequence
from dataclasses import dataclass

from siliqua_index.rounding import div_half_up


@dataclass(frozen=True)
class TwapResult:
    value: int | None
    stale_hours: int
    void: bool


def twap(hourly: Sequence[int | None], max_stale_hours: int = 6) -> TwapResult:
    """Mean of the published hours; None marks an unpublished (stale) hour.

    Stale hours are cumulative inside the window. Above the limit the market is void.
    """
    if not hourly:
        raise ValueError("twap needs at least one hour")
    published = [value for value in hourly if value is not None]
    stale_hours = len(hourly) - len(published)
    if stale_hours > max_stale_hours or not published:
        return TwapResult(value=None, stale_hours=stale_hours, void=True)
    return TwapResult(
        value=div_half_up(sum(published), len(published)),
        stale_hours=stale_hours,
        void=False,
    )
