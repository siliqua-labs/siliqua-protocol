import re
from collections.abc import Mapping
from dataclasses import dataclass

MIN_INTERVAL_SECONDS = 60
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
PRIVATE_KEY = re.compile(r"^(0x)?[0-9a-fA-F]{64}$")


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    api_url: str
    signing_key: str
    chain_id: int
    oracle_address: str
    slugs: tuple[str, ...]
    interval_seconds: int


def _required(environ: Mapping[str, str], name: str) -> str:
    value = environ.get(name)
    if not value:
        raise ConfigError(f"{name} is not set")
    return value


def _integer(environ: Mapping[str, str], name: str, default: int | None, minimum: int) -> int:
    raw = environ.get(name) or (str(default) if default is not None else _required(environ, name))
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from None
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}, got {value}")
    return value


def load_settings(environ: Mapping[str, str]) -> Settings:
    signing_key = _required(environ, "SIGNING_KEY")
    # The key is never echoed in an error message.
    if not PRIVATE_KEY.match(signing_key):
        raise ConfigError("SIGNING_KEY must be 32 bytes of hex")
    oracle_address = _required(environ, "ORACLE_ADDRESS")
    if not ADDRESS.match(oracle_address):
        raise ConfigError(f"ORACLE_ADDRESS is not an address: {oracle_address!r}")
    names = _required(environ, "ORACLE_INDEX_SLUGS").split(",")
    slugs = tuple(name.strip() for name in names if name.strip())
    if not slugs:
        raise ConfigError("ORACLE_INDEX_SLUGS must name at least one index slug")
    return Settings(
        api_url=_required(environ, "API_URL").rstrip("/"),
        signing_key=signing_key if signing_key.startswith("0x") else f"0x{signing_key}",
        chain_id=_integer(environ, "CHAIN_ID", None, 1),
        oracle_address=oracle_address,
        slugs=slugs,
        interval_seconds=_integer(environ, "ORACLE_INTERVAL_SECONDS", 300, MIN_INTERVAL_SECONDS),
    )
