"""Runs against the local Postgres; each test is rolled back. Test data sits in 2027-05, far from
any real social data, and `now` is in 2027 so the window never reaches real posts."""

import os
from datetime import UTC, date, datetime, timedelta

import psycopg
import pytest
from index_engine.cmi_daily import COMPUTABLE_DAYS, process_cmi

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")

NOW = datetime(2027, 5, 12, 6, 0, tzinfo=UTC)
DAY = date(2027, 5, 11)
NOON = datetime(2027, 5, 11, 12, 0, tzinfo=UTC)


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute("delete from cmi_daily_values where day >= '2027-01-01'")
        connection.execute("delete from cmi_daily where day >= '2027-01-01'")
        yield connection
        connection.rollback()


def add_post(conn, platform, post_id, created_at, label, credibility=10_000):
    conn.execute(
        "insert into social_posts (platform, post_id, author_id, created_at, label,"
        " bot_score_bps, credibility_bps, model_hash) values (%s, %s, 'a', %s, %s, 0, %s, 'm')",
        (platform, post_id, created_at, label, credibility),
    )


def add_platform_day(conn, day, platform):
    conn.execute(
        "insert into social_platform_days values (%s, %s, 1, true) on conflict do nothing",
        (day, platform),
    )


def day_row(conn, day):
    return conn.execute(
        "select status, stale_reason, platforms_with_data, posts_used from cmi_daily where day = %s",
        (day,),
    ).fetchone()


def values(conn, day):
    rows = conn.execute("select narrative, value_bps from cmi_daily_values where day = %s", (day,))
    return dict(rows.fetchall())


def test_a_day_with_two_platforms_gets_values_that_sum_to_10000(conn):
    for platform in ("farcaster", "bluesky"):
        add_platform_day(conn, DAY, platform)
    add_post(conn, "farcaster", "p1", NOON, "GPU_SUPPLY")
    add_post(conn, "bluesky", "p2", NOON, "AI_AGENTS")
    assert process_cmi(conn, NOW) >= 1
    assert day_row(conn, DAY) == ("LIVE", None, 2, 2)
    result = values(conn, DAY)
    assert sum(result.values()) == 10_000
    assert result["GPU_SUPPLY"] == result["AI_AGENTS"] == 5_000
    assert set(result) == {
        "GPU_SUPPLY",
        "DEPIN_COMPUTE",
        "AI_INFERENCE",
        "AI_AGENTS",
        "DATACENTER_POWER",
        "OTHER",
    }


def test_one_platform_is_a_stale_day_with_no_values(conn):
    add_platform_day(conn, DAY, "farcaster")
    add_post(conn, "farcaster", "p1", NOON, "GPU_SUPPLY")
    process_cmi(conn, NOW)
    assert day_row(conn, DAY) == ("STALE", "platforms", 1, 0)
    assert values(conn, DAY) == {}


def test_a_computed_day_is_never_rewritten(conn):
    for platform in ("farcaster", "bluesky"):
        add_platform_day(conn, DAY, platform)
    add_post(conn, "farcaster", "p1", NOON, "GPU_SUPPLY")
    process_cmi(conn, NOW)
    first = conn.execute("select input_hash from cmi_daily where day = %s", (DAY,)).fetchone()
    add_post(conn, "bluesky", "late", NOON, "AI_AGENTS")
    process_cmi(conn, NOW)
    assert (
        conn.execute("select input_hash from cmi_daily where day = %s", (DAY,)).fetchone() == first
    )


def test_the_current_day_is_not_computed_until_it_is_over(conn):
    today = NOW.date()
    for platform in ("farcaster", "bluesky"):
        add_platform_day(conn, today, platform)
    process_cmi(conn, NOW)
    assert day_row(conn, today) is None


def test_days_older_than_the_computable_window_are_left_without_a_value(conn):
    old = NOW.date() - timedelta(days=COMPUTABLE_DAYS + 2)
    add_platform_day(conn, old, "farcaster")
    process_cmi(conn, NOW)
    assert day_row(conn, old) is None


def test_posts_after_the_day_end_do_not_count(conn):
    for platform in ("farcaster", "bluesky"):
        add_platform_day(conn, DAY, platform)
    add_post(conn, "farcaster", "p1", NOON, "GPU_SUPPLY")
    add_post(conn, "bluesky", "next-day", datetime(2027, 5, 12, 0, 0, tzinfo=UTC), "AI_AGENTS")
    process_cmi(conn, NOW)
    assert values(conn, DAY)["GPU_SUPPLY"] == 10_000
