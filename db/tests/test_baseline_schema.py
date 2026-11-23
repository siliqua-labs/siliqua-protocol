"""Runs against a local Postgres started with `docker compose up -d`.

    DATABASE_URL=postgresql://... uv run pytest db

Every test runs in a transaction that is rolled back, so the database stays clean.
"""

import os
from datetime import UTC, datetime

import psycopg
import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        yield connection
        connection.rollback()


def insert_source(conn, source_id="runpod"):
    conn.execute("insert into sources (id) values (%s) on conflict do nothing", (source_id,))


def insert_observation(conn, observed_at, price="2.690000", gpu_class="h100"):
    conn.execute(
        "insert into price_observations"
        " (source_id, gpu_class, observed_at, price, payload_sha256, collector_version)"
        " values ('runpod', %s, %s, %s, 'abc', '0')",
        (gpu_class, observed_at, price),
    )


def test_every_table_has_rls_and_no_policy(conn):
    tables = conn.execute(
        "select c.relname, c.relrowsecurity from pg_class c"
        " join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind in ('r', 'p')"
    ).fetchall()
    assert tables
    assert [name for name, rls in tables if not rls] == []
    assert conn.execute("select count(*) from pg_policies").fetchone()[0] == 0


def test_observation_lands_in_the_current_month_partition(conn):
    insert_source(conn)
    now = datetime.now(UTC)
    insert_observation(conn, now)
    partition = conn.execute("select tableoid::regclass::text from price_observations").fetchone()[
        0
    ]
    assert partition == f"price_observations_{now:%Y_%m}"


def test_observation_without_a_partition_fails_loudly(conn):
    insert_source(conn)
    with pytest.raises(psycopg.errors.CheckViolation):
        insert_observation(conn, datetime(2001, 1, 1, tzinfo=UTC))


def test_non_positive_price_is_rejected(conn):
    insert_source(conn)
    with pytest.raises(psycopg.errors.CheckViolation):
        insert_observation(conn, datetime.now(UTC), price="0")


def test_unknown_gpu_class_is_rejected(conn):
    insert_source(conn)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        insert_observation(conn, datetime.now(UTC), gpu_class="v100")


def test_the_same_quote_cannot_be_stored_twice(conn):
    insert_source(conn)
    moment = datetime.now(UTC)
    insert_observation(conn, moment)
    with pytest.raises(psycopg.errors.UniqueViolation):
        insert_observation(conn, moment)


def insert_hourly(conn, hour, status, value):
    conn.execute(
        "insert into methodology_versions values ('1.0', now(), now(), 'hash')"
        " on conflict do nothing"
    )
    conn.execute(
        "insert into gri_hourly"
        " (index_id, hour, value, valid_sources, status, methodology_version, input_hash)"
        " values ('gri-h100', %s, %s, 5, %s, '1.0', 'hash')",
        (hour, value, status),
    )


def test_live_hour_needs_a_value_and_other_hours_must_have_none(conn):
    hour = datetime(2026, 11, 23, 10, tzinfo=UTC)
    with pytest.raises(psycopg.errors.CheckViolation):
        insert_hourly(conn, hour, "LIVE", None)
    conn.rollback()
    with pytest.raises(psycopg.errors.CheckViolation):
        insert_hourly(conn, hour, "STALE", "2.5")


def test_hour_must_be_on_the_hour(conn):
    with pytest.raises(psycopg.errors.CheckViolation):
        insert_hourly(conn, datetime(2026, 11, 23, 10, 30, tzinfo=UTC), "LIVE", "2.5")


def test_input_must_belong_to_an_existing_hour(conn):
    insert_source(conn)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        conn.execute(
            "insert into gri_inputs (index_id, hour, source_id, price, weight, kept)"
            " values ('gri-h100', '2026-11-23T10:00:00Z', 'runpod', 2.5, 1, true)"
        )
