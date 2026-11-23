from collections.abc import Mapping
from dataclasses import dataclass

from price_collectors.runner import ConfigError

MIN_INTERVAL_SECONDS = 60


@dataclass(frozen=True)
class Settings:
    database_url: str
    interval_seconds: int


def load_settings(environ: Mapping[str, str]) -> Settings:
    database_url = environ.get("DATABASE_URL")
    if not database_url:
        raise ConfigError("DATABASE_URL is not set")
    raw_interval = environ.get("COLLECT_INTERVAL_SECONDS", "600")
    try:
        interval = int(raw_interval)
    except ValueError:
        raise ConfigError(
            f"COLLECT_INTERVAL_SECONDS must be an integer, got {raw_interval!r}"
        ) from None
    if interval < MIN_INTERVAL_SECONDS:
        raise ConfigError(
            f"COLLECT_INTERVAL_SECONDS must be at least {MIN_INTERVAL_SECONDS}, got {interval}"
        )
    return Settings(database_url=database_url, interval_seconds=interval)
