"""Daily CMI value, docs/methodology/cmi-v1.0.md.

Inputs are integers (basis points, unix seconds). The one non-integer step, the
48 h half-life decay, uses Decimal at fixed precision and is rounded to an integer
scale, so the result is identical on every platform.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, localcontext

OTHER = "OTHER"
TOTAL_BPS = 10_000
DAY_SECONDS = 86_400
DECAY_SCALE = 10**12


@dataclass(frozen=True)
class Methodology:
    lookback_seconds: int
    half_life_seconds: int
    min_platforms: int
    age_cap_days: int
    age_floor_bps: int
    listed_account_multiplier_bps: int


METHODOLOGIES = {
    "1.0": Methodology(
        lookback_seconds=7 * DAY_SECONDS,
        half_life_seconds=48 * 3600,
        min_platforms=2,
        age_cap_days=365,
        age_floor_bps=1_000,
        listed_account_multiplier_bps=20_000,
    ),
}


@dataclass(frozen=True)
class Post:
    id: str
    platform: str
    created_at: int
    credibility_bps: int
    label: str


@dataclass(frozen=True)
class CmiResult:
    values: dict[str, int] | None
    stale_reason: str | None
    total_raw: int
    posts_used: int


def _methodology(version: str) -> Methodology:
    if version not in METHODOLOGIES:
        raise ValueError(f"unknown methodology version {version!r}")
    return METHODOLOGIES[version]


def classify(scores: Mapping[str, int], narratives: Sequence[str], entry_threshold_bps: int) -> str:
    """Argmax over the narrative scores (bps); ties go to the earlier narrative in the list.

    The best score below the entry threshold means the post is OTHER.
    """
    if OTHER in narratives or len(set(narratives)) != len(narratives):
        raise ValueError("narratives must be unique and must not contain OTHER")
    unknown = set(scores) - set(narratives)
    if unknown:
        raise ValueError(f"scores for unknown narratives: {sorted(unknown)}")
    best_label = OTHER
    best_score = 0
    for narrative in narratives:
        score = scores.get(narrative, 0)
        if type(score) is not int or not 0 <= score <= TOTAL_BPS:
            raise ValueError(
                f"score for {narrative!r} must be an integer in 0..10000, got {score!r}"
            )
        if score > best_score:
            best_label, best_score = narrative, score
    if best_score == 0 or best_score < entry_threshold_bps:
        return OTHER
    return best_label


def credibility(
    account_age_days: int, bot_score_bps: int, listed: bool, methodology_version: str = "1.0"
) -> int:
    """Account age, bot score (0 human .. 10,000 bot) and the owner's tier list, in bps."""
    m = _methodology(methodology_version)
    if account_age_days < 0 or not 0 <= bot_score_bps <= TOTAL_BPS:
        raise ValueError(f"invalid credibility inputs: age {account_age_days}, bot {bot_score_bps}")
    age_bps = max(
        m.age_floor_bps, min(account_age_days, m.age_cap_days) * TOTAL_BPS // m.age_cap_days
    )
    human_bps = age_bps * (TOTAL_BPS - bot_score_bps) // TOTAL_BPS
    if listed:
        return human_bps * m.listed_account_multiplier_bps // TOTAL_BPS
    return human_bps


def decay_factor(age_seconds: int, half_life_seconds: int) -> int:
    """2 ** (-age / half_life) scaled by 10**12, rounded half up."""
    if age_seconds < 0 or half_life_seconds <= 0:
        raise ValueError(f"invalid decay inputs: age {age_seconds}, half-life {half_life_seconds}")
    with localcontext() as ctx:
        ctx.prec = 60
        factor = Decimal(2) ** (-Decimal(age_seconds) / Decimal(half_life_seconds))
        return int((factor * DECAY_SCALE).to_integral_value(rounding="ROUND_HALF_UP"))


def largest_remainder(raw: Mapping[str, int], order: Sequence[str]) -> dict[str, int]:
    """Split TOTAL_BPS in proportion to raw; leftover units go to the largest remainders.

    Ties on the remainder go to the earlier key in order, so the result is deterministic.
    """
    total = sum(raw.values())
    if total <= 0:
        raise ValueError("largest_remainder needs a positive total")
    shares = {key: raw[key] * TOTAL_BPS // total for key in order}
    leftover = TOTAL_BPS - sum(shares.values())
    by_remainder = sorted(
        order, key=lambda key: (-(raw[key] * TOTAL_BPS % total), order.index(key))
    )
    for key in by_remainder[:leftover]:
        shares[key] += 1
    return shares


def cmi(
    posts: Sequence[Post],
    narratives: Sequence[str],
    day_end: int,
    platforms_with_data: int,
    methodology_version: str = "1.0",
) -> CmiResult:
    """Share of weighted attention per narrative at the end of a day.

    values is None (stale) when fewer platforms than the minimum returned data or when no
    post carries weight. Otherwise values covers every narrative plus OTHER and sums to 10,000.
    """
    m = _methodology(methodology_version)
    if platforms_with_data < m.min_platforms:
        return CmiResult(None, "platforms", 0, 0)

    order = [*narratives, OTHER]
    raw = dict.fromkeys(order, 0)
    used = 0
    for post in posts:
        if post.label not in raw:
            raise ValueError(f"post {post.id!r} has unknown label {post.label!r}")
        age = day_end - post.created_at
        if age < 0 or age > m.lookback_seconds:
            continue
        weight = post.credibility_bps * decay_factor(age, m.half_life_seconds)
        raw[post.label] += weight
        used += 1

    total = sum(raw.values())
    if total == 0:
        return CmiResult(None, "zero_total", 0, used)
    return CmiResult(largest_remainder(raw, order), None, total, used)


__all__ = [
    "OTHER",
    "CmiResult",
    "Post",
    "classify",
    "cmi",
    "credibility",
    "decay_factor",
    "largest_remainder",
]
