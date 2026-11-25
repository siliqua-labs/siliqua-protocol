"""Fixture is a hand-written payload with the field shape seen in a live searchPosts response
on 2026-11-25. The text is synthetic; no real posts are stored in the repo."""

from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from social_collectors import bluesky

PAYLOAD = (Path(__file__).parent / "fixtures" / "bluesky_search_shape.json").read_bytes()


def test_parse_maps_post_fields():
    posts, cursor = bluesky.parse(PAYLOAD)
    first = posts[0]
    assert cursor == "cursor-page-2"
    assert first.platform == "bluesky"
    assert first.post_id == "at://did:plc:example1/app.bsky.feed.post/3kaaaaaaaaaaa"
    assert first.author_id == "did:plc:example1"
    assert first.created_at == datetime(2026, 11, 25, 8, 45, 40, 723000, tzinfo=UTC)
    assert first.author_created_at == datetime(2024, 5, 2, 9, 0, tzinfo=UTC)
    assert first.quality_score is None


def test_parse_keeps_missing_account_date_as_none():
    assert bluesky.parse(PAYLOAD)[0][1].author_created_at is None


class FakePds:
    def __init__(self, expire_first_search: bool = False):
        self.calls: list[str] = []
        self.expire_first_search = expire_first_search

    def __call__(self, request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[-1]
        self.calls.append(name)
        if name == "com.atproto.server.createSession":
            return httpx.Response(200, json={"accessJwt": "a1", "refreshJwt": "r1"})
        if name == "com.atproto.server.refreshSession":
            assert request.headers["authorization"] == "Bearer r1"
            return httpx.Response(200, json={"accessJwt": "a2", "refreshJwt": "r2"})
        if self.expire_first_search and request.headers["authorization"] == "Bearer a1":
            return httpx.Response(400, json={"error": "ExpiredToken", "message": "expired"})
        return httpx.Response(200, content=PAYLOAD)


def make_session(pds: FakePds) -> bluesky.BlueskySession:
    client = httpx.Client(transport=httpx.MockTransport(pds))
    return bluesky.BlueskySession(client, "handle.example", "app-password")


def test_search_logs_in_once_and_reuses_the_token():
    pds = FakePds()
    session = make_session(pds)
    session.search("gpu", 5)
    session.search("gpu", 5, "c1")
    assert pds.calls.count("com.atproto.server.createSession") == 1


def test_search_refreshes_an_expired_token_instead_of_logging_in_again():
    pds = FakePds(expire_first_search=True)
    session = make_session(pds)
    assert session.search("gpu", 5) == PAYLOAD
    assert pds.calls == [
        "com.atproto.server.createSession",
        "app.bsky.feed.searchPosts",
        "com.atproto.server.refreshSession",
        "app.bsky.feed.searchPosts",
    ]


def test_search_raises_when_the_login_is_rejected():
    def reject(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "AuthenticationRequired"})

    session = bluesky.BlueskySession(
        httpx.Client(transport=httpx.MockTransport(reject)), "handle.example", "bad"
    )
    with pytest.raises(httpx.HTTPStatusError):
        session.search("gpu", 5)
