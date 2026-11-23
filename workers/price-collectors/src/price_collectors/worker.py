import logging
import os
import time
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from importlib.metadata import version

import httpx
import psycopg

from price_collectors.config import load_settings
from price_collectors.registry import PROVIDERS
from price_collectors.runner import CollectionResult, Provider, collect_enabled
from price_collectors.store import save_observations

log = logging.getLogger(__name__)


def run_once(
    conn: psycopg.Connection,
    providers: Sequence[Provider],
    environ: Mapping[str, str],
    client: httpx.Client,
    now: datetime,
    collector_version: str,
) -> list[CollectionResult]:
    results = collect_enabled(providers, environ, client, now)
    observations = [o for result in results for o in result.observations]
    saved = save_observations(conn, observations, collector_version)
    failed = [r.provider for r in results if r.error is not None]
    log.info("run done: %d observations saved, failed providers: %s", saved, failed or "none")
    return results


def main(argv: Sequence[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings(os.environ)
    once = "--once" in argv
    collector_version = version("price-collectors")
    with (
        httpx.Client(timeout=60) as client,
        psycopg.connect(settings.database_url) as conn,
    ):
        while True:
            started = time.monotonic()
            now = datetime.now(UTC).replace(microsecond=0)
            run_once(conn, PROVIDERS, os.environ, client, now, collector_version)
            conn.commit()
            if once:
                return
            time.sleep(max(0.0, settings.interval_seconds - (time.monotonic() - started)))
