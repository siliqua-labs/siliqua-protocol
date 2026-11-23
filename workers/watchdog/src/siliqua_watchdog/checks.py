from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import pairwise

# Plan gate N3: no raw-coverage gap over 6 hours.
MAX_COVERAGE_GAP = timedelta(hours=6)


@dataclass(frozen=True)
class Finding:
    key: str
    message: str


def coverage_gaps(
    times_by_class: Mapping[str, Sequence[datetime]],
    window_start: datetime,
    now: datetime,
    max_gap: timedelta = MAX_COVERAGE_GAP,
) -> list[Finding]:
    """Report each stretch longer than `max_gap` with no observation for a class.

    The window edges count as boundaries, so a class that went quiet after its last
    observation is reported while the gap is still open.
    """
    findings = []
    for gpu_class, times in sorted(times_by_class.items()):
        edges = [window_start, *sorted(times), now]
        for before, after in pairwise(edges):
            if after - before > max_gap:
                findings.append(
                    Finding(
                        key=f"coverage:{gpu_class}:{before.isoformat()}",
                        message=(
                            f"{gpu_class}: no observation from {before:%Y-%m-%d %H:%M} to"
                            f" {after:%Y-%m-%d %H:%M} UTC ({after - before})"
                        ),
                    )
                )
    return findings


def stale_sources(
    latest_by_source: Mapping[str, datetime],
    expected: Collection[str],
    now: datetime,
    max_age: timedelta,
) -> list[Finding]:
    """Report enabled sources whose newest observation is too old, or that never reported."""
    findings = []
    for source in sorted(expected):
        latest = latest_by_source.get(source)
        if latest is None:
            findings.append(Finding(f"freshness:{source}", f"{source}: no observation yet"))
        elif now - latest > max_age:
            findings.append(
                Finding(
                    f"freshness:{source}",
                    f"{source}: last observation {latest:%Y-%m-%d %H:%M} UTC is {now - latest} old",
                )
            )
    return findings
