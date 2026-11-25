import logging
from datetime import datetime

import httpx

from social_collectors import bluesky, farcaster
from social_collectors.classifier import KEYWORDS
from social_collectors.post import SocialPost

log = logging.getLogger(__name__)

PAGE_LIMIT = 100
# Bluesky reads are free but bounded: a keyword with more new posts than this in one run
# catches up on the next run, because `since` follows the newest stored post.
BLUESKY_MAX_PAGES_PER_KEYWORD = 10


def farcaster_query(keywords: list[str], after: datetime) -> str:
    """One OR query per narrative; `after:` is UTC (checked live on 2026-11-25)."""
    phrases = " | ".join(f'"{keyword}"' for keyword in keywords)
    return f"({phrases}) after:{after.strftime('%Y-%m-%dT%H:%M:%S')}"


def collect_farcaster(
    client: httpx.Client, api_key: str, after: datetime, cast_budget: int
) -> list[SocialPost]:
    """Read new casts for every narrative until the cast budget is spent.

    Each cast returned costs 10 credits, including one that another narrative already returned,
    so the budget counts casts read, not casts kept.
    """
    posts: dict[str, SocialPost] = {}
    remaining = cast_budget
    for narrative, keywords in KEYWORDS.items():
        query = farcaster_query(keywords, after)
        cursor = None
        while remaining > 0:
            payload = farcaster.fetch(client, api_key, query, min(PAGE_LIMIT, remaining), cursor)
            page, cursor = farcaster.parse(payload)
            remaining -= len(page)
            posts.update((post.post_id, post) for post in page)
            if cursor is None or not page:
                break
        if remaining <= 0:
            log.warning("farcaster: cast budget spent at narrative %s", narrative)
            break
    return list(posts.values())


def collect_bluesky(session: bluesky.BlueskySession, since: datetime) -> list[SocialPost]:
    posts: dict[str, SocialPost] = {}
    since_text = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    for keywords in KEYWORDS.values():
        for keyword in keywords:
            cursor = None
            for _ in range(BLUESKY_MAX_PAGES_PER_KEYWORD):
                payload = session.search(f'"{keyword}"', PAGE_LIMIT, cursor, since_text)
                page, cursor = bluesky.parse(payload)
                posts.update((post.post_id, post) for post in page)
                if cursor is None or not page:
                    break
            else:
                log.warning("bluesky: %r hit the page cap, the rest follows next run", keyword)
    return list(posts.values())
