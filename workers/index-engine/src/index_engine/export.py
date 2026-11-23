"""Monthly raw export with a SHA-256 manifest (PLAN 0.9).

Usage: python -m index_engine.export YYYY-MM OUT_DIR
"""

import csv
import hashlib
import json
import os
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime
from importlib.metadata import version
from pathlib import Path

import psycopg

# Column order is part of the format: verify reads these files back by name.
TABLES = {
    "price_observations": (
        (
            "select source_id, gpu_class, observed_at, price::text, payload_sha256,"
            " collector_version from price_observations"
            " where observed_at >= %s and observed_at < %s"
            " order by observed_at, source_id, gpu_class"
        ),
        ("source_id", "gpu_class", "observed_at", "price", "payload_sha256", "collector_version"),
    ),
    "gri_hourly": (
        (
            "select index_id, hour, value::text, valid_sources, status, methodology_version,"
            " input_hash from gri_hourly where hour >= %s and hour < %s order by hour, index_id"
        ),
        (
            "index_id",
            "hour",
            "value",
            "valid_sources",
            "status",
            "methodology_version",
            "input_hash",
        ),
    ),
    "gri_inputs": (
        (
            "select index_id, hour, source_id, price::text, weight, kept from gri_inputs"
            " where hour >= %s and hour < %s order by hour, index_id, source_id"
        ),
        ("index_id", "hour", "source_id", "price", "weight", "kept"),
    ),
}


def month_bounds(month: str) -> tuple[datetime, datetime]:
    try:
        first = date.fromisoformat(f"{month}-01")
    except ValueError:
        raise ValueError(f"month must look like 2027-05, got {month!r}") from None
    following = date(first.year + first.month // 12, first.month % 12 + 1, 1)
    return (
        datetime(first.year, first.month, 1, tzinfo=UTC),
        datetime(following.year, following.month, 1, tzinfo=UTC),
    )


def _cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_month(conn: psycopg.Connection, month: str, out_dir: Path) -> dict:
    start, end = month_bounds(month)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for table, (query, columns) in TABLES.items():
        path = out_dir / f"{table}.csv"
        rows = 0
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(columns)
            for row in conn.execute(query, (start, end)):
                writer.writerow([_cell(value) for value in row])
                rows += 1
        files[path.name] = {"sha256": sha256_file(path), "rows": rows}
    methodologies = {
        row[0]: row[1]
        for row in conn.execute(
            "select version, spec_hash from methodology_versions order by version"
        )
    }
    manifest = {
        "month": month,
        "siliqua_index_version": version("siliqua-index"),
        "methodologies": methodologies,
        "files": files,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest


def main(argv: Sequence[str]) -> int:
    if len(argv) != 2:
        print("usage: python -m index_engine.export YYYY-MM OUT_DIR", file=sys.stderr)
        return 2
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    with psycopg.connect(database_url) as conn:
        manifest = export_month(conn, argv[0], Path(argv[1]))
        conn.rollback()
    for name, entry in manifest["files"].items():
        print(f"{name}: {entry['rows']} rows, sha256 {entry['sha256']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
