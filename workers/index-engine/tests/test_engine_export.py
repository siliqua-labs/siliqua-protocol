"""Export then verify, against the local Postgres. Test data sits in 2027-07, rolled back."""

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest
from index_engine.export import export_month, month_bounds
from index_engine.store import ensure_methodology
from index_engine.verify import VerifyError, verify
from index_engine.worker import DEFAULT_SPEC, process

DATABASE_URL = os.environ.get("DATABASE_URL")

START = datetime(2027, 7, 10, 10, tzinfo=UTC)
NOW = datetime(2027, 7, 10, 13, 30, tzinfo=UTC)
FIVE_SOURCES = {"a": "2.00", "b": "2.02", "c": "1.98", "d": "2.01", "e": "1.99"}


@pytest.fixture
def conn():
    if DATABASE_URL is None:
        pytest.skip("DATABASE_URL is not set")
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute("select ensure_price_observation_partition('2027-07-01')")
        for source, price in FIVE_SOURCES.items():
            connection.execute(
                "insert into sources (id) values (%s) on conflict do nothing", (source,)
            )
            connection.execute(
                "insert into price_observations"
                " (source_id, gpu_class, observed_at, price, payload_sha256, collector_version)"
                " values (%s, 'h100', %s, %s, 'h', '0')",
                (source, START + timedelta(minutes=5), price),
            )
        ensure_methodology(connection, "1.0", DEFAULT_SPEC, NOW)
        process(connection, NOW, start=START)
        yield connection
        connection.rollback()


def test_month_bounds_reject_bad_input():
    assert month_bounds("2027-12")[1] == datetime(2028, 1, 1, tzinfo=UTC)
    with pytest.raises(ValueError):
        month_bounds("2027-13")


def test_export_then_verify_reproduces_every_hour(conn, tmp_path: Path):
    manifest = export_month(conn, "2027-07", tmp_path)
    assert manifest["files"]["price_observations.csv"]["rows"] == 5
    assert manifest["files"]["gri_hourly.csv"]["rows"] == 15
    checked, mismatches = verify(tmp_path, None)
    assert (checked, mismatches) == (15, [])
    assert verify(tmp_path, 3)[0] == 3


def test_export_is_deterministic(conn, tmp_path: Path):
    first = export_month(conn, "2027-07", tmp_path / "one")
    second = export_month(conn, "2027-07", tmp_path / "two")
    assert first == second


def test_tampered_file_fails_the_manifest_check(conn, tmp_path: Path):
    export_month(conn, "2027-07", tmp_path)
    observations = tmp_path / "price_observations.csv"
    observations.write_text(observations.read_text().replace("2.000000", "9.000000"))
    with pytest.raises(VerifyError, match="does not match the manifest"):
        verify(tmp_path, None)


def test_consistent_tampering_is_caught_by_recompute(conn, tmp_path: Path):
    import hashlib
    import json

    export_month(conn, "2027-07", tmp_path)
    hourly = tmp_path / "gri_hourly.csv"
    hourly.write_text(hourly.read_text().replace("2.000000", "3.000000"))
    manifest_path = tmp_path / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"]["gri_hourly.csv"]["sha256"] = hashlib.sha256(hourly.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest))
    checked, mismatches = verify(tmp_path, None)
    assert checked == 15
    assert len(mismatches) == 1
    assert "value" in mismatches[0]
