"""Runs against the local Postgres, like test_baseline_schema.py."""

import os

import psycopg
import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        yield connection
        connection.rollback()


def insert_post(conn, **override):
    row = {
        "platform": "farcaster",
        "post_id": "0xabc",
        "author_id": "1001",
        "created_at": "2026-11-25T08:00:00Z",
        "label": "GPU_SUPPLY",
        "bot_score_bps": 700,
        "credibility_bps": 9300,
        "model_hash": "h" * 64,
        **override,
    }
    conn.execute(
        "insert into social_posts"
        " (platform, post_id, author_id, created_at, label, bot_score_bps, credibility_bps,"
        " model_hash) values (%(platform)s, %(post_id)s, %(author_id)s, %(created_at)s,"
        " %(label)s, %(bot_score_bps)s, %(credibility_bps)s, %(model_hash)s)",
        row,
    )


def insert_day(conn, **override):
    row = {
        "day": "2026-11-25",
        "status": "LIVE",
        "stale_reason": None,
        "platforms_with_data": 3,
        "posts_used": 10,
        **override,
    }
    conn.execute(
        "insert into cmi_daily (day, status, stale_reason, platforms_with_data, posts_used,"
        " methodology_version, input_hash) values (%(day)s, %(status)s, %(stale_reason)s,"
        " %(platforms_with_data)s, %(posts_used)s, '1.0', 'abc')",
        row,
    )


def test_a_post_is_stored_once_per_platform(conn):
    insert_post(conn)
    with pytest.raises(psycopg.errors.UniqueViolation), conn.transaction():
        insert_post(conn)
    insert_post(conn, platform="bluesky")


@pytest.mark.parametrize(
    "override",
    [
        {"platform": "telegram"},
        {"bot_score_bps": 10001},
        {"bot_score_bps": -1},
        {"credibility_bps": -1},
    ],
)
def test_post_checks(conn, override):
    with pytest.raises(psycopg.errors.CheckViolation):
        insert_post(conn, **override)


def test_posts_have_no_text_column(conn):
    columns = {
        name
        for (name,) in conn.execute(
            "select column_name from information_schema.columns where table_name = 'social_posts'"
        )
    }
    assert not columns & {"text", "content", "body"}


def test_platform_day_returned_data_must_match_the_post_count(conn):
    conn.execute("insert into social_platform_days values ('2026-11-25', 'x', 0, false)")
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("insert into social_platform_days values ('2026-11-25', 'bluesky', 0, true)")


def test_stale_day_needs_a_reason_and_live_day_must_have_none(conn):
    insert_day(conn, status="STALE", stale_reason="zero_total")
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        insert_day(conn, day="2026-11-26", status="STALE")
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        insert_day(conn, day="2026-11-27", stale_reason="platforms")


def test_value_must_belong_to_an_existing_day_and_stay_in_range(conn):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        conn.execute("insert into cmi_daily_values values ('2026-11-25', 'GPU_SUPPLY', 5000)")
    conn.rollback()
    insert_day(conn)
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("insert into cmi_daily_values values ('2026-11-25', 'GPU_SUPPLY', 10001)")
