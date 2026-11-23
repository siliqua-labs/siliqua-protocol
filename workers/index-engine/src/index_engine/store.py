import hashlib
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import psycopg

from index_engine.compute import HourlyRecord

MICRO = Decimal(1_000_000)


def floor_hour(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def ensure_methodology(
    conn: psycopg.Connection, methodology_version: str, spec_path: Path, now: datetime
) -> None:
    """Register the version with the hash of its spec; a changed spec under the same version fails."""
    # Normalise line endings so the hash does not depend on the checkout platform.
    digest = hashlib.sha256(spec_path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    row = conn.execute(
        "select spec_hash from methodology_versions where version = %s", (methodology_version,)
    ).fetchone()
    if row is None:
        conn.execute(
            "insert into methodology_versions (version, announced_at, effective_from, spec_hash)"
            " values (%s, %s, %s, %s)",
            (methodology_version, now, now, digest),
        )
    elif row[0] != digest:
        raise ValueError(
            f"methodology {methodology_version} changed after it was registered: {spec_path} no"
            " longer matches the stored hash. Publish a new version instead of editing this one."
        )


def gpu_classes(conn: psycopg.Connection) -> list[str]:
    return [row[0] for row in conn.execute("select id from gpu_classes order by id")]


def first_observation(conn: psycopg.Connection) -> datetime | None:
    return conn.execute("select min(observed_at) from price_observations").fetchone()[0]


def load_observations(
    conn: psycopg.Connection, start: datetime, end: datetime
) -> dict[tuple[datetime, str], dict[str, list[int]]]:
    """Micro-USD prices by (hour, class) and source, for observations in [start, end)."""
    grouped: dict[tuple[datetime, str], dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(list)
    )
    rows = conn.execute(
        "select gpu_class, source_id, observed_at, price from price_observations"
        " where observed_at >= %s and observed_at < %s",
        (start, end),
    )
    for gpu_class, source_id, observed_at, price in rows:
        grouped[(floor_hour(observed_at), gpu_class)][source_id].append(int(price * MICRO))
    return grouped


def existing_hours(
    conn: psycopg.Connection, start: datetime, end: datetime
) -> set[tuple[str, datetime]]:
    rows = conn.execute(
        "select index_id, hour from gri_hourly where hour >= %s and hour <= %s", (start, end)
    )
    return {(index_id, hour.astimezone(UTC)) for index_id, hour in rows}


def save_records(conn: psycopg.Connection, records: Sequence[HourlyRecord]) -> None:
    """Insert only; a published hour is never rewritten."""
    with conn.cursor() as cur:
        for record in records:
            cur.execute(
                "insert into gri_hourly"
                " (index_id, hour, value, valid_sources, status, methodology_version, input_hash)"
                " values (%s, %s, %s, %s, %s, %s, %s)",
                (
                    record.index_id,
                    record.hour,
                    None if record.value_micro is None else Decimal(record.value_micro) / MICRO,
                    record.valid_sources,
                    record.status,
                    record.methodology_version,
                    record.input_hash,
                ),
            )
        cur.executemany(
            "insert into gri_inputs (index_id, hour, source_id, price, weight, kept)"
            " values (%s, %s, %s, %s, %s, %s)",
            [
                (
                    record.index_id,
                    record.hour,
                    item.source_id,
                    Decimal(item.price_micro) / MICRO,
                    item.weight,
                    item.kept,
                )
                for record in records
                for item in record.inputs
            ],
        )
