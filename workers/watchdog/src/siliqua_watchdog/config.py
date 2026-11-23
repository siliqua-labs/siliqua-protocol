from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta

MIN_INTERVAL_SECONDS = 60


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    database_url: str
    interval_seconds: int
    window: timedelta
    source_max_age: timedelta
    alert_webhook_url: str | None


def _positive_int(environ: Mapping[str, str], name: str, default: int, minimum: int = 1) -> int:
    raw = environ.get(name, str(default))
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from None
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}, got {value}")
    return value


def load_settings(environ: Mapping[str, str]) -> Settings:
    database_url = environ.get("DATABASE_URL")
    if not database_url:
        raise ConfigError("DATABASE_URL is not set")
    return Settings(
        database_url=database_url,
        interval_seconds=_positive_int(
            environ, "WATCHDOG_INTERVAL_SECONDS", 600, MIN_INTERVAL_SECONDS
        ),
        window=timedelta(hours=_positive_int(environ, "WATCHDOG_WINDOW_HOURS", 720)),
        # Three missed 10-minute collection rounds.
        source_max_age=timedelta(
            seconds=_positive_int(environ, "WATCHDOG_SOURCE_MAX_AGE_SECONDS", 1800)
        ),
        alert_webhook_url=environ.get("ALERT_WEBHOOK_URL") or None,
    )
