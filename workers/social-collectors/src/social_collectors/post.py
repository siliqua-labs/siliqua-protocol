from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True)
class SocialPost:
    """One post as read from a platform.

    text is held in memory for the classifier and is never persisted: whether post text may be
    stored is an open owner decision (docs/progres.md, Stage 4). quality_score is the provider's
    own 0..1 account score where one exists (Neynar); how it maps to the bot score is not decided.
    """

    platform: str
    post_id: str
    author_id: str
    created_at: datetime
    author_created_at: datetime | None
    quality_score: Decimal | None
    text: str
