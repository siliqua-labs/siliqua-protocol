"""Runs against the local Postgres from `docker compose up -d`; each test is rolled back."""

import os
from datetime import UTC, datetime
from decimal import Decimal

import psycopg
import pytest
from price_collectors.observation import Observation
from price_collectors.store import save_observations

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")

AT = datetime(2027, 6, 15, 10, 0, tzinfo=UTC)


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        yield connection
        connection.rollback()


def observation(provider="runpod", gpu_class="h100", micro=4_390_000, observed_at=AT):
    return Observation(provider, gpu_class, micro, observed_at, "abc123")


def test_saves_rows_with_exact_prices_and_creates_the_source(conn):
    saved = save_observations(
        conn, [observation(), observation(gpu_class="4090", micro=890_000)], "0.0.1"
    )
    assert saved == 2
    rows = conn.execute(
        "select source_id, gpu_class, price, payload_sha256, collector_version"
        " from price_observations where observed_at = %s order by gpu_class",
        (AT,),
    ).fetchall()
    assert rows == [
        ("runpod", "4090", Decimal("0.890000"), "abc123", "0.0.1"),
        ("runpod", "h100", Decimal("4.390000"), "abc123", "0.0.1"),
    ]


def test_creates_the_partition_for_the_month_and_the_next_one(conn):
    save_observations(conn, [observation()], "0.0.1")
    partitions = {
        name
        for (name,) in conn.execute(
            "select relname from pg_class where relname like 'price_observations_2027_%'"
        )
    }
    assert {"price_observations_2027_06", "price_observations_2027_07"} <= partitions


def test_december_rolls_over_to_january(conn):
    december = datetime(2027, 12, 31, 23, 50, tzinfo=UTC)
    save_observations(conn, [observation(observed_at=december)], "0.0.1")
    exists = conn.execute(
        "select count(*) from pg_class where relname = 'price_observations_2028_01'"
    ).fetchone()[0]
    assert exists == 1


def test_known_source_is_reused(conn):
    save_observations(conn, [observation()], "0.0.1")
    save_observations(conn, [observation(gpu_class="b200")], "0.0.1")
    count = conn.execute("select count(*) from sources where id = 'runpod'").fetchone()[0]
    assert count == 1


def test_nothing_to_save_touches_nothing(conn):
    assert save_observations(conn, [], "0.0.1") == 0


def test_a_duplicate_quote_fails_loudly(conn):
    save_observations(conn, [observation()], "0.0.1")
    with pytest.raises(psycopg.errors.UniqueViolation):
        save_observations(conn, [observation()], "0.0.1")
