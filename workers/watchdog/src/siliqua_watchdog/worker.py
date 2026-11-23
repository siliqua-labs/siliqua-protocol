import logging
import os
import time
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime

import httpx
import psycopg
from price_collectors.registry import PROVIDERS
from price_collectors.runner import is_enabled

from siliqua_watchdog.alert import send_alert
from siliqua_watchdog.checks import Finding, coverage_gaps, stale_sources
from siliqua_watchdog.config import Settings, load_settings
from siliqua_watchdog.store import (
    first_observation,
    known_classes,
    latest_by_source,
    observation_times_by_class,
)

log = logging.getLogger(__name__)


def run_checks(
    conn: psycopg.Connection, settings: Settings, environ: Mapping[str, str], now: datetime
) -> list[Finding]:
    first = first_observation(conn)
    if first is None:
        return [Finding("empty", "no observations in the database yet")]
    # A new deployment has no history to be missing, so the window starts at the first row.
    window_start = max(first, now - settings.window)
    times = observation_times_by_class(conn, window_start, known_classes(conn))
    expected = [provider.name for provider in PROVIDERS if is_enabled(provider, environ)]
    return coverage_gaps(times, window_start, now) + stale_sources(
        latest_by_source(conn), expected, now, settings.source_max_age
    )


def new_findings(findings: Sequence[Finding], already_sent: set[str]) -> list[Finding]:
    """Findings not yet alerted. `already_sent` is updated, and drops keys that resolved."""
    keys = {finding.key for finding in findings}
    already_sent.intersection_update(keys)
    fresh = [finding for finding in findings if finding.key not in already_sent]
    already_sent.update(finding.key for finding in fresh)
    return fresh


def main(argv: Sequence[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings(os.environ)
    once = "--once" in argv
    already_sent: set[str] = set()
    with psycopg.connect(settings.database_url) as conn, httpx.Client() as client:
        while True:
            started = time.monotonic()
            findings = run_checks(conn, settings, os.environ, datetime.now(UTC))
            conn.rollback()
            for finding in findings:
                log.error("%s", finding.message)
            if not findings:
                log.info("all checks passed")
            fresh = new_findings(findings, already_sent)
            if fresh and settings.alert_webhook_url:
                try:
                    send_alert(client, settings.alert_webhook_url, fresh)
                except httpx.HTTPError:
                    # Keep the keys unsent so the next round tries again.
                    already_sent.difference_update(finding.key for finding in fresh)
                    log.exception("alert delivery failed")
            elif fresh:
                log.warning("ALERT_WEBHOOK_URL is not set; findings are logged only")
            if once:
                return 1 if findings else 0
            time.sleep(max(0.0, settings.interval_seconds - (time.monotonic() - started)))
