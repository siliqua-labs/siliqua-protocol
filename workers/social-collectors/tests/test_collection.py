import json
from datetime import UTC, datetime

import httpx
from social_collectors import bluesky
from social_collectors.classifier import KEYWORDS
from social_collectors.collection import collect_bluesky, collect_farcaster, farcaster_query

AFTER = datetime(2026, 11, 25, 8, 30, 15, tzinfo=UTC)


def cast(number):
    return {
        "hash": f"0x{number:040x}",
        "author": {"fid": number, "registered_at": "2024-01-01T00:00:00.000Z", "score": 0.9},
        "text": "synthetic",
        "timestamp": "2026-11-25T09:00:00.000Z",
    }


def test_farcaster_query_is_an_or_of_phrases_with_a_utc_after_filter():
    query = farcaster_query(["gpu shortage", "h100"], AFTER)
    assert query == '("gpu shortage" | "h100") after:2026-11-25T08:30:15'


def test_collect_farcaster_stops_at_the_cast_budget():
    limits = []

    def handler(request: httpx.Request) -> httpx.Response:
        limit = int(request.url.params["limit"])
        limits.append(limit)
        body = {"result": {"casts": [cast(i) for i in range(limit)], "next": {"cursor": "more"}}}
        return httpx.Response(200, content=json.dumps(body))

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        posts = collect_farcaster(client, "k", AFTER, cast_budget=150)
    assert limits == [100, 50]
    assert len(posts) == 100


def test_collect_farcaster_runs_every_narrative_and_removes_duplicates():
    queries = []

    def handler(request: httpx.Request) -> httpx.Response:
        queries.append(request.url.params["q"])
        body = {"result": {"casts": [cast(1)], "next": {"cursor": None}}}
        return httpx.Response(200, content=json.dumps(body))

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        posts = collect_farcaster(client, "k", AFTER, cast_budget=1_000)
    assert len(queries) == len(KEYWORDS)
    assert len(posts) == 1


def test_collect_bluesky_pages_each_keyword_and_sends_since():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[-1]
        if name == "com.atproto.server.createSession":
            return httpx.Response(200, json={"accessJwt": "a", "refreshJwt": "r"})
        params = request.url.params
        seen.append((params["q"], params.get("cursor"), params["since"]))
        first_page = "cursor" not in params
        post = {
            "uri": f"at://did:plc:x/app.bsky.feed.post/{len(seen)}",
            "author": {"did": "did:plc:x"},
            "record": {"text": "synthetic", "createdAt": "2026-11-25T09:00:00.000Z"},
        }
        body = {"posts": [post], "cursor": "next" if first_page else None}
        return httpx.Response(200, content=json.dumps(body))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    session = bluesky.BlueskySession(client, "h", "p")
    posts = collect_bluesky(session, AFTER)
    keyword_count = sum(len(keywords) for keywords in KEYWORDS.values())
    assert len(seen) == 2 * keyword_count
    assert seen[0] == ('"gpu shortage"', None, "2026-11-25T08:30:15Z")
    assert seen[1] == ('"gpu shortage"', "next", "2026-11-25T08:30:15Z")
    assert len(posts) == 2 * keyword_count
