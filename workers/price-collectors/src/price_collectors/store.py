from collections.abc import Sequence
from datetime import date
from decimal import Decimal

import psycopg

from price_collectors.observation import MICRO, Observation


def save_observations(
    conn: psycopg.Connection, observations: Sequence[Observation], collector_version: str
) -> int:
    """Insert observations in the caller's transaction; the caller commits."""
    if not observations:
        return 0
    with conn.cursor() as cur:
        for month in _months_to_cover(observations):
            cur.execute("select ensure_price_observation_partition(%s)", (month,))
        for provider in sorted({o.provider for o in observations}):
            cur.execute("insert into sources (id) values (%s) on conflict do nothing", (provider,))
        cur.executemany(
            "insert into price_observations"
            " (source_id, gpu_class, observed_at, price, payload_sha256, collector_version)"
            " values (%s, %s, %s, %s, %s, %s)",
            [
                (
                    o.provider,
                    o.gpu_class,
                    o.observed_at,
                    Decimal(o.price_micro_usd) / MICRO,
                    o.payload_sha256,
                    collector_version,
                )
                for o in observations
            ],
        )
    return len(observations)


def _months_to_cover(observations: Sequence[Observation]) -> list[date]:
    # The month of every observation plus the one after the latest, so a partition exists
    # before the month rolls over.
    months = {date(o.observed_at.year, o.observed_at.month, 1) for o in observations}
    latest = max(months)
    following = date(latest.year + latest.month // 12, latest.month % 12 + 1, 1)
    return sorted(months | {following})
