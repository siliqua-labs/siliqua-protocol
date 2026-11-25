"""Farcaster through Neynar cast search, https://docs.neynar.com/reference/search-casts

Cost on the Free plan: 10 credits per cast returned, measured live on 2026-11-25 with limit 1
and 5 only (docs/sources.md). Credits, not the rate limit, are the binding cap, so callers
choose limit deliberately.
"""

import json
from datetime import datetime
from decimal import Decimal

import httpx

from social_collectors.post import SocialPost

PLATFORM = "farcaster"
API_KEY_ENV = "NEYNAR_API_KEY"
SEARCH_URL = "https://api.neynar.com/v2/farcaster/cast/search"


def fetch(
    client: httpx.Client, api_key: str, query: str, limit: int, cursor: str | None = None
) -> bytes:
    params: dict[str, str | int] = {"q": query, "limit": limit}
    if cursor:
        params["cursor"] = cursor
    response = client.get(SEARCH_URL, params=params, headers={"x-api-key": api_key})
    response.raise_for_status()
    return response.content


def parse(payload: bytes) -> tuple[list[SocialPost], str | None]:
    body = json.loads(payload, parse_float=Decimal)
    result = body["result"]
    posts = []
    for cast in result["casts"]:
        author = cast["author"]
        registered_at = author.get("registered_at")
        posts.append(
            SocialPost(
                platform=PLATFORM,
                post_id=cast["hash"],
                author_id=str(author["fid"]),
                created_at=datetime.fromisoformat(cast["timestamp"]),
                author_created_at=datetime.fromisoformat(registered_at) if registered_at else None,
                quality_score=_score(author.get("score")),
                text=cast["text"],
            )
        )
    next_page = result.get("next") or {}
    return posts, next_page.get("cursor")


def _score(raw: object) -> Decimal | None:
    # parse_float=Decimal leaves JSON integers as int, and Neynar sends a score of exactly 0 or 1
    # as an integer, which crashed the worker. Booleans are rejected, Decimal(True) is 1.
    if raw is None:
        return None
    if isinstance(raw, bool) or not isinstance(raw, int | Decimal):
        raise TypeError(f"neynar score is not a number: {raw!r}")
    return Decimal(raw)
