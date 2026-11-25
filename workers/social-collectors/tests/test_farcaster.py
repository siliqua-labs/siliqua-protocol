"""Fixture is a hand-written payload with the field shape seen in a live Neynar response on
2026-11-25. The text is synthetic; no real posts are stored in the repo."""

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from social_collectors import farcaster

PAYLOAD = (Path(__file__).parent / "fixtures" / "farcaster_search_shape.json").read_bytes()


def test_parse_maps_cast_fields():
    posts, cursor = farcaster.parse(PAYLOAD)
    first = posts[0]
    assert cursor == "cursor-page-2"
    assert first.platform == "farcaster"
    assert first.post_id == "0xaaaa000000000000000000000000000000000001"
    assert first.author_id == "1001"
    assert first.created_at == datetime(2026, 11, 25, 8, 28, 7, tzinfo=UTC)
    assert first.author_created_at == datetime(2024, 3, 1, 10, 0, tzinfo=UTC)
    assert first.quality_score == Decimal("0.93")


def test_parse_keeps_missing_account_fields_as_none():
    second = farcaster.parse(PAYLOAD)[0][1]
    assert second.author_created_at is None
    assert second.quality_score is None


def test_parse_without_next_page_gives_no_cursor():
    payload = b'{"result": {"casts": [], "next": {"cursor": null}}}'
    assert farcaster.parse(payload) == ([], None)


def test_parse_fails_on_unexpected_shape():
    with pytest.raises(KeyError):
        farcaster.parse(b'{"casts": []}')


def test_fetch_sends_key_query_and_cursor():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = request.url
        seen["key"] = request.headers["x-api-key"]
        return httpx.Response(200, content=PAYLOAD)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert farcaster.fetch(client, "k", "gpu compute", 5, "c1") == PAYLOAD
    assert seen["key"] == "k"
    assert seen["url"].params["q"] == "gpu compute"
    assert seen["url"].params["limit"] == "5"
    assert seen["url"].params["cursor"] == "c1"


def test_fetch_raises_on_payment_required():
    transport = httpx.MockTransport(lambda request: httpx.Response(402))
    with httpx.Client(transport=transport) as client, pytest.raises(httpx.HTTPStatusError):
        farcaster.fetch(client, "k", "gpu", 1)


def cast_with_score(score: str) -> bytes:
    return (
        '{"result": {"casts": [{"hash": "0x1", "text": "t", "timestamp": "2026-11-25T08:28:07+00:00",'
        f' "author": {{"fid": 1, "score": {score}}}}}], "next": {{}}}}}}'
    ).encode()


def test_integer_score_is_read_as_decimal():
    # Neynar sends 0 and 1 without a decimal point; this once crashed the worker.
    assert farcaster.parse(cast_with_score("1"))[0][0].quality_score == Decimal(1)
    assert farcaster.parse(cast_with_score("0"))[0][0].quality_score == Decimal(0)


def test_non_numeric_score_is_an_error():
    with pytest.raises(TypeError, match="not a number"):
        farcaster.parse(cast_with_score("true"))
