from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from siliqua_index import credibility

from social_collectors.classifier import label_text
from social_collectors.post import SocialPost

# Bluesky exposes no account quality score. Until the owner picks a source, every Bluesky
# post gets this neutral value so the weight comes from account age only.
UNSCORED_BOT_BPS = 5_000

# The owner's tier list is empty until the owner provides it.
LISTED_AUTHORS: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ScoredPost:
    post: SocialPost
    label: str
    bot_score_bps: int
    credibility_bps: int


def bot_score_bps(post: SocialPost) -> int | None:
    """Bot score in bps (0 human, 10,000 bot), or None when the platform should have given one
    and did not."""
    if post.quality_score is None:
        return UNSCORED_BOT_BPS if post.platform == "bluesky" else None
    if not Decimal(0) <= post.quality_score <= Decimal(1):
        raise ValueError(f"quality score outside 0..1 for {post.post_id}: {post.quality_score}")
    quality_bps = int((post.quality_score * 10_000).to_integral_value(rounding=ROUND_HALF_UP))
    return 10_000 - quality_bps


def score_post(post: SocialPost, entry_threshold_bps: int) -> ScoredPost | None:
    """None means the post is dropped: no usable bot score."""
    bot_bps = bot_score_bps(post)
    if bot_bps is None:
        return None
    if post.author_created_at is None:
        age_days = 0
    else:
        age_days = max(0, (post.created_at - post.author_created_at).days)
    return ScoredPost(
        post=post,
        label=label_text(post.text, entry_threshold_bps),
        bot_score_bps=bot_bps,
        credibility_bps=credibility(age_days, bot_bps, post.author_id in LISTED_AUTHORS),
    )
