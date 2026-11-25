from collections.abc import Sequence
from datetime import datetime, timedelta

import psycopg

from social_collectors.classifier import MODEL_HASH
from social_collectors.scoring import ScoredPost

# Posts older than the 7-day lookback plus one day of margin no longer affect any day's CMI, so
# they are deleted (owner decision 2026-11-25, to stay inside the database size limit).
RETENTION = timedelta(days=8)


def last_created_at(conn: psycopg.Connection, platform: str) -> datetime | None:
    row = conn.execute(
        "select max(created_at) from social_posts where platform = %s", (platform,)
    ).fetchone()
    return row[0]


def casts_collected_since(conn: psycopg.Connection, platform: str, since: datetime) -> int:
    row = conn.execute(
        "select count(*) from social_posts where platform = %s and collected_at >= %s",
        (platform, since),
    ).fetchone()
    return row[0]


def save_posts(conn: psycopg.Connection, scored: Sequence[ScoredPost]) -> int:
    """Insert in the caller's transaction; a post already stored is left as it is."""
    if not scored:
        return 0
    with conn.cursor() as cur:
        cur.executemany(
            "insert into social_posts (platform, post_id, author_id, created_at,"
            " author_created_at, label, bot_score_bps, credibility_bps, model_hash)"
            " values (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
            " on conflict (platform, post_id) do nothing",
            [
                (
                    s.post.platform,
                    s.post.post_id,
                    s.post.author_id,
                    s.post.created_at,
                    s.post.author_created_at,
                    s.label,
                    s.bot_score_bps,
                    s.credibility_bps,
                    MODEL_HASH,
                )
                for s in scored
            ],
        )
        return cur.rowcount


def refresh_platform_days(conn: psycopg.Connection, since: datetime) -> None:
    """Recount the days from `since` on; older days are final and may have lost posts to retention."""
    conn.execute(
        "insert into social_platform_days (day, platform, posts, returned_data)"
        " select (created_at at time zone 'UTC')::date, platform, count(*), true"
        " from social_posts where created_at >= %s group by 1, 2"
        " on conflict (day, platform) do update"
        " set posts = excluded.posts, returned_data = excluded.returned_data",
        (since,),
    )


def delete_expired(conn: psycopg.Connection, now: datetime) -> int:
    return conn.execute(
        "delete from social_posts where created_at < %s", (now - RETENTION,)
    ).rowcount
