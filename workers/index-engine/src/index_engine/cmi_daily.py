"""Daily CMI from stored posts, docs/methodology/cmi-v1.0.md section 6.

A day is computed once it is complete and never rewritten, like an hourly GRI value.
"""

import hashlib
import json
import logging
from datetime import UTC, date, datetime, time, timedelta
from importlib.metadata import version

import psycopg
from siliqua_index import Post, cmi
from siliqua_index.cmi import METHODOLOGIES, CmiResult

METHODOLOGY_VERSION = "1.0"

# social-collectors keeps posts for 10 days. The lookback is 7 days, so a day whose end is up to
# 3 days old still has its whole window stored. A day missed for longer is left without a value
# rather than computed from a partly deleted window.
COMPUTABLE_DAYS = 3

log = logging.getLogger(__name__)


def process_cmi(conn: psycopg.Connection, now: datetime) -> int:
    """Compute every complete, still computable day that has no value yet."""
    first_day = conn.execute("select min(day) from social_platform_days").fetchone()[0]
    if first_day is None:
        log.info("no social data yet")
        return 0
    today = now.astimezone(UTC).date()
    done = {row[0] for row in conn.execute("select day from cmi_daily")}
    day = max(first_day, today - timedelta(days=COMPUTABLE_DAYS))
    written = 0
    while day < today:
        if day not in done:
            _compute_day(conn, day)
            written += 1
        day += timedelta(days=1)
    log.info("computed %d CMI days", written)
    return written


def _compute_day(conn: psycopg.Connection, day: date) -> None:
    methodology = METHODOLOGIES[METHODOLOGY_VERSION]
    day_end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=UTC)
    window_start = day_end - timedelta(seconds=methodology.lookback_seconds)
    rows = conn.execute(
        "select post_id, platform, created_at, credibility_bps, label, model_hash"
        " from social_posts where created_at >= %s and created_at < %s order by platform, post_id",
        (window_start, day_end),
    ).fetchall()
    platforms_with_data = conn.execute(
        "select count(*) from social_platform_days where day = %s and returned_data", (day,)
    ).fetchone()[0]
    posts = [
        Post(
            id=f"{platform}:{post_id}",
            platform=platform,
            created_at=int(created_at.timestamp()),
            credibility_bps=credibility_bps,
            label=label,
        )
        for post_id, platform, created_at, credibility_bps, label, _ in rows
    ]
    result = cmi(
        posts,
        list(methodology.narratives),
        int(day_end.timestamp()),
        platforms_with_data,
        METHODOLOGY_VERSION,
    )
    input_hash = _input_hash(day, posts, platforms_with_data, sorted({row[5] for row in rows}))
    _save(conn, day, result, platforms_with_data, input_hash)


def _input_hash(
    day: date, posts: list[Post], platforms_with_data: int, model_hashes: list[str]
) -> str:
    # The package version is part of the hash: a different build of the index math is a
    # different computation (PLAN 5.4).
    canonical = json.dumps(
        {
            "methodology": METHODOLOGY_VERSION,
            "package": version("siliqua-index"),
            "day": day.isoformat(),
            "platforms_with_data": platforms_with_data,
            "models": model_hashes,
            "posts": [[p.id, p.created_at, p.credibility_bps, p.label] for p in posts],
        },
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _save(
    conn: psycopg.Connection,
    day: date,
    result: CmiResult,
    platforms_with_data: int,
    input_hash: str,
) -> None:
    conn.execute(
        "insert into cmi_daily (day, status, stale_reason, platforms_with_data, posts_used,"
        " methodology_version, input_hash) values (%s, %s, %s, %s, %s, %s, %s)",
        (
            day,
            "STALE" if result.values is None else "LIVE",
            result.stale_reason,
            platforms_with_data,
            result.posts_used,
            METHODOLOGY_VERSION,
            input_hash,
        ),
    )
    if result.values is not None:
        with conn.cursor() as cur:
            cur.executemany(
                "insert into cmi_daily_values (day, narrative, value_bps) values (%s, %s, %s)",
                [(day, narrative, bps) for narrative, bps in result.values.items()],
            )
