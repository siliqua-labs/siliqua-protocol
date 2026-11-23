import logging
import os
import time
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg

from index_engine.compute import compute_hour, index_id_for
from index_engine.config import load_settings
from index_engine.store import (
    ensure_methodology,
    existing_hours,
    first_observation,
    floor_hour,
    gpu_classes,
    load_observations,
    save_records,
)

METHODOLOGY_VERSION = "1.0"
DEFAULT_SPEC = Path(__file__).parents[4] / "docs" / "methodology" / "gri-v1.0.md"
HOUR = timedelta(hours=1)

log = logging.getLogger(__name__)


def process(
    conn: psycopg.Connection,
    now: datetime,
    start: datetime | None = None,
    spec_path: Path = DEFAULT_SPEC,
) -> int:
    """Compute every complete hour that has no value yet, for every class.

    Hours with no observation at all are stored as STALE so a gap is visible and counts toward
    the TWAP stale limit. `start` bounds a backfill; by default it is the first observation.
    """
    ensure_methodology(conn, METHODOLOGY_VERSION, spec_path, now)
    first_seen = start if start is not None else first_observation(conn)
    if first_seen is None:
        log.info("no observations yet")
        return 0
    first_hour = floor_hour(first_seen)
    last_hour = floor_hour(now) - HOUR
    if first_hour > last_hour:
        return 0

    classes = gpu_classes(conn)
    observed = load_observations(conn, first_hour, last_hour + HOUR)
    present = existing_hours(conn, first_hour, last_hour)
    records = []
    hour = first_hour
    while hour <= last_hour:
        for gpu_class in classes:
            if (index_id_for(gpu_class), hour) in present:
                continue
            records.append(
                compute_hour(
                    gpu_class, hour, observed.get((hour, gpu_class), {}), METHODOLOGY_VERSION
                )
            )
        hour += HOUR
    save_records(conn, records)
    published = sum(1 for r in records if r.status == "LIVE")
    log.info("computed %d hours, %d LIVE", len(records), published)
    return len(records)


def main(argv: Sequence[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings(os.environ)
    once = "--once" in argv
    with psycopg.connect(settings.database_url) as conn:
        while True:
            started = time.monotonic()
            process(conn, datetime.now(UTC))
            conn.commit()
            if once:
                return
            time.sleep(max(0.0, settings.interval_seconds - (time.monotonic() - started)))
