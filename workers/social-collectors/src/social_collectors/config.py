from collections.abc import Mapping
from dataclasses import dataclass


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    database_url: str
    interval_seconds: int
    farcaster_daily_cast_budget: int
    entry_threshold_bps: int
    initial_lookback_hours: int


def _integer(environ: Mapping[str, str], name: str, default: int, minimum: int) -> int:
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
        interval_seconds=_integer(environ, "SOCIAL_INTERVAL_SECONDS", 3600, 600),
        # Neynar Free is 10M credits per month at 10 credits per cast, about 33,000 casts per
        # day. The default leaves room for other calls and for the plan's own accounting error.
        farcaster_daily_cast_budget=_integer(environ, "FARCASTER_DAILY_CAST_BUDGET", 20_000, 0),
        # Proposed value, to be set from the 500-post test.
        entry_threshold_bps=_integer(environ, "CMI_ENTRY_THRESHOLD_BPS", 4_000, 0),
        initial_lookback_hours=_integer(environ, "SOCIAL_INITIAL_LOOKBACK_HOURS", 24, 1),
    )
