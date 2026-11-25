import logging
import os
import time
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta

import httpx
import psycopg

from social_collectors import bluesky, farcaster, store
from social_collectors.collection import collect_bluesky, collect_farcaster
from social_collectors.config import ConfigError, Settings, load_settings
from social_collectors.post import SocialPost
from social_collectors.scoring import score_post

log = logging.getLogger(__name__)

OVERLAP = timedelta(minutes=5)


def is_enabled(platform: str, environ: Mapping[str, str]) -> bool:
    # Off unless switched on: a source with unresolved terms must never run by default.
    return environ.get(f"COLLECTOR_{platform.upper()}_ENABLED") == "true"


def required(environ: Mapping[str, str], platform: str, name: str) -> str:
    value = environ.get(name)
    if not value:
        raise ConfigError(f"{platform} is enabled but {name} is not set")
    return value


def read_after(
    conn: psycopg.Connection, platform: str, now: datetime, settings: Settings
) -> datetime:
    newest = store.last_created_at(conn, platform)
    if newest is None:
        return now - timedelta(hours=settings.initial_lookback_hours)
    return newest - OVERLAP


def run_once(
    conn: psycopg.Connection,
    environ: Mapping[str, str],
    client: httpx.Client,
    bluesky_session: bluesky.BlueskySession | None,
    now: datetime,
    settings: Settings,
) -> dict[str, int]:
    """Collect from each enabled platform, store scored posts, return posts stored per platform.

    One platform failing is logged and does not stop the other; its day then has no data.
    """
    stored: dict[str, int] = {}
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if is_enabled(farcaster.PLATFORM, environ):
        api_key = required(environ, farcaster.PLATFORM, farcaster.API_KEY_ENV)
        spent_today = store.casts_collected_since(conn, farcaster.PLATFORM, day_start)
        budget = settings.farcaster_daily_cast_budget - spent_today
        if budget <= 0:
            log.warning("farcaster: daily cast budget already spent, skipped")
        else:
            collected = _guarded(
                farcaster.PLATFORM,
                lambda: collect_farcaster(
                    client, api_key, read_after(conn, farcaster.PLATFORM, now, settings), budget
                ),
            )
            stored[farcaster.PLATFORM] = _save(conn, collected, settings)

    if bluesky_session is not None:
        collected = _guarded(
            bluesky.PLATFORM,
            lambda: collect_bluesky(
                bluesky_session, read_after(conn, bluesky.PLATFORM, now, settings)
            ),
        )
        stored[bluesky.PLATFORM] = _save(conn, collected, settings)

    store.refresh_platform_days(conn, day_start - timedelta(days=1))
    deleted = store.delete_expired(conn, now)
    log.info("run done: stored %s, expired posts deleted: %d", stored or "nothing", deleted)
    return stored


def _guarded(platform: str, collect) -> list[SocialPost]:
    try:
        return collect()
    except httpx.HTTPError:
        log.exception("%s: collection failed", platform)
        return []


def _save(conn: psycopg.Connection, posts: Sequence[SocialPost], settings: Settings) -> int:
    scored = [score_post(post, settings.entry_threshold_bps) for post in posts]
    kept = [s for s in scored if s is not None]
    if len(kept) < len(scored):
        log.warning("dropped %d posts without a usable bot score", len(scored) - len(kept))
    return store.save_posts(conn, kept)


def main(argv: Sequence[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings(os.environ)
    once = "--once" in argv
    with (
        httpx.Client(timeout=60) as client,
        psycopg.connect(settings.database_url) as conn,
    ):
        session = None
        if is_enabled(bluesky.PLATFORM, os.environ):
            session = bluesky.BlueskySession(
                client,
                required(os.environ, bluesky.PLATFORM, bluesky.HANDLE_ENV),
                required(os.environ, bluesky.PLATFORM, bluesky.APP_PASSWORD_ENV),
            )
        while True:
            started = time.monotonic()
            now = datetime.now(UTC).replace(microsecond=0)
            run_once(conn, os.environ, client, session, now, settings)
            conn.commit()
            if once:
                return
            time.sleep(max(0.0, settings.interval_seconds - (time.monotonic() - started)))
