"""Runs against the local Postgres; test data sits in 2027-06 and each test is rolled back."""

import os
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from siliqua_watchdog.checks import coverage_gaps
from siliqua_watchdog.store import observation_times_by_class

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")

T0 = datetime(2027, 6, 10, tzinfo=UTC)


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute("select ensure_price_observation_partition('2027-06-01')")
        connection.execute("insert into sources (id) values ('a'), ('b') on conflict do nothing")
        yield connection
        connection.rollback()


def observe(conn, source, gpu_class, at):
    conn.execute(
        "insert into price_observations"
        " (source_id, gpu_class, observed_at, price, payload_sha256, collector_version)"
        " values (%s, %s, %s, 1, 'h', '0')",
        (source, gpu_class, at),
    )


def test_times_are_distinct_per_class_and_every_class_has_a_key(conn):
    observe(conn, "a", "h100", T0)
    observe(conn, "b", "h100", T0)
    observe(conn, "a", "h100", T0 + timedelta(hours=8))
    times = observation_times_by_class(conn, T0, ["h100", "b200"])
    assert times["h100"] == [T0, T0 + timedelta(hours=8)]
    assert times["b200"] == []
    findings = coverage_gaps({"h100": times["h100"]}, T0, T0 + timedelta(hours=8))
    assert len(findings) == 1
