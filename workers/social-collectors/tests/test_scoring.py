from datetime import UTC, datetime
from decimal import Decimal

import pytest
from social_collectors.post import SocialPost
from social_collectors.scoring import UNSCORED_BOT_BPS, bot_score_bps, score_post

CREATED = datetime(2026, 11, 25, 8, 0, tzinfo=UTC)


def make_post(**override):
    fields = {
        "platform": "farcaster",
        "post_id": "p1",
        "author_id": "1001",
        "created_at": CREATED,
        "author_created_at": datetime(2025, 11, 25, 8, 0, tzinfo=UTC),
        "quality_score": Decimal("0.93"),
        "text": "h100 rental and gpu rental are tight",
        **override,
    }
    return SocialPost(**fields)


def test_neynar_quality_score_becomes_the_inverse_bot_score():
    assert bot_score_bps(make_post(quality_score=Decimal("0.93"))) == 700
    assert bot_score_bps(make_post(quality_score=Decimal(1))) == 0
    assert bot_score_bps(make_post(quality_score=Decimal(0))) == 10_000
    assert bot_score_bps(make_post(quality_score=Decimal("0.12345"))) == 8_765


def test_quality_score_outside_zero_to_one_fails_loudly():
    with pytest.raises(ValueError):
        bot_score_bps(make_post(quality_score=Decimal("1.5")))


def test_bluesky_gets_the_neutral_score_and_farcaster_without_a_score_is_dropped():
    assert bot_score_bps(make_post(platform="bluesky", quality_score=None)) == UNSCORED_BOT_BPS
    assert bot_score_bps(make_post(quality_score=None)) is None
    assert score_post(make_post(quality_score=None), 4_000) is None


def test_score_post_labels_and_weighs_the_post():
    scored = score_post(make_post(), 4_000)
    assert scored.label == "GPU_SUPPLY"
    assert scored.bot_score_bps == 700
    # A year-old account: age factor 10,000, times (10,000 - 700) / 10,000.
    assert scored.credibility_bps == 9_300


def test_missing_account_date_counts_as_a_new_account():
    scored = score_post(make_post(author_created_at=None, quality_score=Decimal(1)), 4_000)
    assert scored.credibility_bps == 1_000
