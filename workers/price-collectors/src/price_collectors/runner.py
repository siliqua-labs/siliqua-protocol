import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

import httpx

from price_collectors.observation import Observation

log = logging.getLogger(__name__)


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    name: str
    api_key_env: str | None
    fetch: Callable[[httpx.Client, str | None], bytes]
    parse: Callable[[bytes, datetime], list[Observation]]


@dataclass(frozen=True)
class CollectionResult:
    provider: str
    observations: tuple[Observation, ...]
    error: str | None


def is_enabled(provider: Provider, environ: Mapping[str, str]) -> bool:
    # Off unless switched on: a source with unresolved terms must never run by default.
    return environ.get(f"COLLECTOR_{provider.name.upper()}_ENABLED") == "true"


def collect_enabled(
    providers: Sequence[Provider],
    environ: Mapping[str, str],
    client: httpx.Client,
    now: datetime,
) -> list[CollectionResult]:
    """Run each enabled provider once. One provider failing does not stop the others."""
    results = []
    for provider in providers:
        if not is_enabled(provider, environ):
            log.info("%s: disabled, skipped", provider.name)
            continue
        api_key = None
        if provider.api_key_env is not None:
            api_key = environ.get(provider.api_key_env)
            if not api_key:
                raise ConfigError(
                    f"{provider.name} is enabled but {provider.api_key_env} is not set"
                )
        try:
            observations = provider.parse(provider.fetch(client, api_key), now)
        except (httpx.HTTPError, ValueError) as exc:
            log.exception("%s: collection failed", provider.name)
            results.append(CollectionResult(provider.name, (), repr(exc)))
            continue
        results.append(CollectionResult(provider.name, tuple(observations), None))
    return results
