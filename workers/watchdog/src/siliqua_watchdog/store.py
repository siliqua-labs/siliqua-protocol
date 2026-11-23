from collections import defaultdict
from datetime import datetime

import psycopg


def first_observation(conn: psycopg.Connection) -> datetime | None:
    return conn.execute("select min(observed_at) from price_observations").fetchone()[0]


def observation_times_by_class(
    conn: psycopg.Connection, start: datetime, classes: list[str]
) -> dict[str, list[datetime]]:
    """Distinct observation times per class since `start`; every known class gets a key."""
    grouped: dict[str, list[datetime]] = defaultdict(list)
    for gpu_class in classes:
        grouped[gpu_class] = []
    rows = conn.execute(
        "select gpu_class, observed_at from price_observations where observed_at >= %s"
        " group by gpu_class, observed_at order by observed_at",
        (start,),
    )
    for gpu_class, observed_at in rows:
        grouped[gpu_class].append(observed_at)
    return grouped


def known_classes(conn: psycopg.Connection) -> list[str]:
    return [row[0] for row in conn.execute("select id from gpu_classes order by id")]


def latest_by_source(conn: psycopg.Connection) -> dict[str, datetime]:
    rows = conn.execute("select source_id, max(observed_at) from price_observations group by 1")
    return dict(rows)
