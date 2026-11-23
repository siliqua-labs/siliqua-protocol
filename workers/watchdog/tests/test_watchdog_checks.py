import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from siliqua_watchdog.alert import send_alert
from siliqua_watchdog.checks import Finding, coverage_gaps, stale_sources
from siliqua_watchdog.config import ConfigError, load_settings
from siliqua_watchdog.worker import new_findings

T0 = datetime(2027, 5, 10, 0, 0, tzinfo=UTC)


def hours(*offsets: float) -> list[datetime]:
    return [T0 + timedelta(hours=h) for h in offsets]


def test_gap_of_exactly_six_hours_is_allowed():
    assert coverage_gaps({"h100": hours(0, 6, 12)}, T0, T0 + timedelta(hours=12)) == []


def test_gap_over_six_hours_is_reported_with_its_start():
    findings = coverage_gaps({"h100": hours(0, 7)}, T0, T0 + timedelta(hours=7))
    assert [f.key for f in findings] == [f"coverage:h100:{T0.isoformat()}"]


def test_open_gap_at_the_end_is_reported():
    findings = coverage_gaps({"h100": hours(0, 1)}, T0, T0 + timedelta(hours=8))
    assert len(findings) == 1
    assert "h100" in findings[0].message


def test_class_without_observations_is_reported_once_the_window_is_long_enough():
    assert len(coverage_gaps({"b200": []}, T0, T0 + timedelta(hours=7))) == 1
    assert coverage_gaps({"b200": []}, T0, T0 + timedelta(hours=6)) == []


def test_stale_and_missing_sources():
    now = T0 + timedelta(hours=1)
    latest = {"runpod": now - timedelta(minutes=10), "vastai": now - timedelta(hours=1)}
    findings = stale_sources(latest, {"runpod", "vastai", "akash"}, now, timedelta(minutes=30))
    assert [f.key for f in findings] == ["freshness:akash", "freshness:vastai"]


def test_source_not_expected_is_ignored():
    now = T0 + timedelta(days=3)
    assert stale_sources({"old": T0}, set(), now, timedelta(minutes=30)) == []


def test_findings_alert_once_and_again_after_they_resolve():
    sent: set[str] = set()
    a, b = Finding("a", "A"), Finding("b", "B")
    assert new_findings([a], sent) == [a]
    assert new_findings([a, b], sent) == [b]
    assert new_findings([a, b], sent) == []
    assert new_findings([b], sent) == []
    assert new_findings([a, b], sent) == [a]


def test_alert_posts_text_and_fails_on_error_status():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(500 if len(seen) > 1 else 204)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        send_alert(client, "https://example.test/hook", [Finding("k", "runpod stale")])
        assert "runpod stale" in seen[0]["text"]
        with pytest.raises(httpx.HTTPStatusError):
            send_alert(client, "https://example.test/hook", [Finding("k", "x")])


def test_settings_defaults_and_validation():
    settings = load_settings({"DATABASE_URL": "postgresql://x"})
    assert settings.interval_seconds == 600
    assert settings.window == timedelta(hours=720)
    assert settings.alert_webhook_url is None
    with pytest.raises(ConfigError):
        load_settings({})
    with pytest.raises(ConfigError):
        load_settings({"DATABASE_URL": "x", "WATCHDOG_INTERVAL_SECONDS": "10"})
    with pytest.raises(ConfigError):
        load_settings({"DATABASE_URL": "x", "WATCHDOG_WINDOW_HOURS": "abc"})
