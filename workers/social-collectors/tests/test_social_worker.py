"""Runs against the local Postgres (DATABASE_URL), inside a transaction that is rolled back."""

import json
import os
from datetime import UTC, datetime, timedelta

import httpx
import psycopg
import pytest
from social_collectors import bluesky
from social_collectors.config import ConfigError, load_settings
from social_collectors.worker import is_enabled, run_once

DATABASE_URL = os.environ.get("DATABASE_URL")
NOW = datetime.now(UTC).replace(microsecond=0)
CAST_AT = NOW - timedelta(minutes=30)
SETTINGS = load_settings({"DATABASE_URL": "x"})


@pytest.fixture
def conn():
    if DATABASE_URL is None:
        pytest.skip("DATABASE_URL is not set")
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute("delete from social_platform_days")
        connection.execute("delete from social_posts")
        yield connection
        connection.rollback()


def neynar_handler(score):
    def handler(request: httpx.Request) -> httpx.Response:
        author = {"fid": 7, "registered_at": "2024-01-01T00:00:00.000Z"}
        if score is not None:
            author["score"] = score
        casts = [
            {
                "hash": "0xaa",
                "author": author,
                "text": "h100 rental and gpu rental",
                "timestamp": CAST_AT.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            }
        ]
        return httpx.Response(
            200, content=json.dumps({"result": {"casts": casts, "next": {"cursor": None}}})
        )

    return handler


ENV = {"COLLECTOR_FARCASTER_ENABLED": "true", "NEYNAR_API_KEY": "k"}


def test_run_stores_scored_posts_without_text_and_counts_the_platform_day(conn):
    client = httpx.Client(transport=httpx.MockTransport(neynar_handler(0.9)))
    assert run_once(conn, ENV, client, None, NOW, SETTINGS) == {"farcaster": 1}
    row = conn.execute(
        "select label, bot_score_bps, credibility_bps, length(model_hash) from social_posts"
    ).fetchone()
    assert row == ("GPU_SUPPLY", 1_000, 9_000, 64)
    day = conn.execute("select day, platform, posts, returned_data from social_platform_days")
    assert day.fetchall() == [(CAST_AT.date(), "farcaster", 1, True)]


def test_a_second_run_does_not_duplicate_posts(conn):
    client = httpx.Client(transport=httpx.MockTransport(neynar_handler(0.9)))
    run_once(conn, ENV, client, None, NOW, SETTINGS)
    run_once(conn, ENV, client, None, NOW + timedelta(hours=1), SETTINGS)
    assert conn.execute("select count(*) from social_posts").fetchone()[0] == 1


def test_a_cast_without_a_score_is_dropped(conn):
    client = httpx.Client(transport=httpx.MockTransport(neynar_handler(None)))
    assert run_once(conn, ENV, client, None, NOW, SETTINGS) == {"farcaster": 0}


def test_a_failing_platform_is_logged_and_stores_nothing(conn, caplog):
    client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(402)))
    assert run_once(conn, ENV, client, None, NOW, SETTINGS) == {"farcaster": 0}
    assert "collection failed" in caplog.text


def test_the_daily_budget_stops_the_run_before_any_call(conn):
    client = httpx.Client(transport=httpx.MockTransport(neynar_handler(0.9)))
    run_once(conn, ENV, client, None, NOW, SETTINGS)
    spent = load_settings({"DATABASE_URL": "x", "FARCASTER_DAILY_CAST_BUDGET": "1"})

    def forbidden(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no call expected once the budget is spent")

    guard = httpx.Client(transport=httpx.MockTransport(forbidden))
    assert run_once(conn, ENV, guard, None, NOW, spent) == {}


def test_posts_past_retention_are_deleted(conn):
    conn.execute(
        "insert into social_posts (platform, post_id, author_id, created_at, label,"
        " bot_score_bps, credibility_bps, model_hash) values"
        " ('bluesky', 'old', 'a', %s, 'OTHER', 0, 0, 'h')",
        (NOW - timedelta(days=11),),
    )
    session = bluesky.BlueskySession(
        httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))), "h", "p"
    )
    run_once(conn, {}, httpx.Client(), session, NOW, SETTINGS)
    assert conn.execute("select count(*) from social_posts").fetchone()[0] == 0


def test_platforms_are_off_unless_switched_on():
    assert not is_enabled("farcaster", {})
    assert is_enabled("farcaster", {"COLLECTOR_FARCASTER_ENABLED": "true"})


def test_settings_reject_a_bad_interval():
    with pytest.raises(ConfigError):
        load_settings({"DATABASE_URL": "x", "SOCIAL_INTERVAL_SECONDS": "30"})
    with pytest.raises(ConfigError):
        load_settings({})
