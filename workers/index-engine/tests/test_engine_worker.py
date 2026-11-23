"""Runs against the local Postgres from `docker compose up -d`; each test is rolled back.

Test data sits in 2027-05 and every run is bounded by `start`, so real local data is untouched.
"""

import os
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from index_engine.store import ensure_methodology
from index_engine.worker import process

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")

H10 = datetime(2027, 5, 10, 10, tzinfo=UTC)
START = H10
NOW = datetime(2027, 5, 10, 13, 30, tzinfo=UTC)
FIVE_SOURCES = {"a": "2.00", "b": "2.02", "c": "1.98", "d": "2.01", "e": "1.99"}


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute("select ensure_price_observation_partition('2027-05-01')")
        yield connection
        connection.rollback()


def observe(conn, source, gpu_class, at, price):
    conn.execute("insert into sources (id) values (%s) on conflict do nothing", (source,))
    conn.execute(
        "insert into price_observations"
        " (source_id, gpu_class, observed_at, price, payload_sha256, collector_version)"
        " values (%s, %s, %s, %s, 'h', '0')",
        (source, gpu_class, at, price),
    )


def hourly(conn, index_id="gri-h100"):
    rows = conn.execute(
        "select hour, value, valid_sources, status from gri_hourly"
        " where index_id = %s and hour >= %s order by hour",
        (index_id, START),
    )
    return {hour.astimezone(UTC): (value, n, status) for hour, value, n, status in rows}


def test_complete_hours_are_computed_for_every_class(conn):
    for source, price in FIVE_SOURCES.items():
        observe(conn, source, "h100", H10 + timedelta(minutes=5), price)
    assert process(conn, NOW, start=START) == 15  # hours 10, 11, 12 for 5 classes
    rows = hourly(conn)
    assert rows[H10][1:] == (5, "LIVE")
    assert str(rows[H10][0]) == "2.000000"
    assert rows[H10 + timedelta(hours=1)] == (None, 0, "STALE")
    assert len(rows) == 3
    assert len(hourly(conn, "gri-4090")) == 3


def test_the_current_incomplete_hour_is_not_computed(conn):
    observe(conn, "a", "h100", datetime(2027, 5, 10, 13, 5, tzinfo=UTC), "2.00")
    process(conn, NOW, start=START)
    assert H10 + timedelta(hours=3) not in hourly(conn)


def test_fewer_than_five_sources_is_not_published(conn):
    for source in "abcd":
        observe(conn, source, "h100", H10 + timedelta(minutes=5), FIVE_SOURCES[source])
    process(conn, NOW, start=START)
    assert hourly(conn)[H10] == (None, 4, "INSUFFICIENT_SOURCES")


def test_a_published_hour_is_never_rewritten(conn):
    for source, price in FIVE_SOURCES.items():
        observe(conn, source, "h100", H10 + timedelta(minutes=5), price)
    process(conn, NOW, start=START)
    before = hourly(conn)[H10]
    observe(conn, "a", "h100", H10 + timedelta(minutes=50), "9.00")
    assert process(conn, NOW, start=START) == 0
    assert hourly(conn)[H10] == before


def test_inputs_record_each_source_and_whether_it_was_kept(conn):
    for source, price in FIVE_SOURCES.items():
        observe(conn, source, "h100", H10 + timedelta(minutes=5), price)
    observe(conn, "f", "h100", H10 + timedelta(minutes=5), "3.90")
    process(conn, NOW, start=START)
    rows = conn.execute(
        "select source_id, price, weight, kept from gri_inputs"
        " where index_id = 'gri-h100' and hour = %s order by source_id",
        (H10,),
    ).fetchall()
    assert [(r[0], r[2], r[3]) for r in rows] == [
        ("a", 1, True),
        ("b", 1, True),
        ("c", 1, True),
        ("d", 1, True),
        ("e", 1, True),
        ("f", 1, False),
    ]


def test_recomputing_from_the_same_data_gives_the_same_hash(conn):
    for source, price in FIVE_SOURCES.items():
        observe(conn, source, "h100", H10 + timedelta(minutes=5), price)
    process(conn, NOW, start=START)
    first = conn.execute(
        "select input_hash from gri_hourly where index_id = 'gri-h100' and hour = %s", (H10,)
    ).fetchone()
    conn.execute("delete from gri_inputs where index_id = 'gri-h100' and hour = %s", (H10,))
    conn.execute("delete from gri_hourly where index_id = 'gri-h100' and hour = %s", (H10,))
    process(conn, NOW, start=START)
    again = conn.execute(
        "select input_hash from gri_hourly where index_id = 'gri-h100' and hour = %s", (H10,)
    ).fetchone()
    assert first == again


def test_no_observations_computes_nothing(conn):
    assert process(conn, NOW, start=START + timedelta(days=400)) == 0


def test_methodology_is_registered_once_and_a_changed_spec_is_refused(conn, tmp_path):
    spec = tmp_path / "spec.md"
    spec.write_text("version nine\n", encoding="utf-8")
    ensure_methodology(conn, "9.9", spec, NOW)
    ensure_methodology(conn, "9.9", spec, NOW)
    assert conn.execute(
        "select count(*) from methodology_versions where version = '9.9'"
    ).fetchone() == (1,)
    spec.write_text("version nine, edited\n", encoding="utf-8")
    with pytest.raises(ValueError, match="changed after it was registered"):
        ensure_methodology(conn, "9.9", spec, NOW)


def test_line_endings_do_not_change_the_spec_hash(conn, tmp_path):
    spec = tmp_path / "spec.md"
    spec.write_bytes(b"line one\nline two\n")
    ensure_methodology(conn, "9.8", spec, NOW)
    spec.write_bytes(b"line one\r\nline two\r\n")
    ensure_methodology(conn, "9.8", spec, NOW)
