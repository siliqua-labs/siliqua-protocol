import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from importlib.metadata import version

from siliqua_index import gri, median
from siliqua_index.gri import METHODOLOGIES


@dataclass(frozen=True)
class InputRecord:
    source_id: str
    price_micro: int
    weight: int
    kept: bool


@dataclass(frozen=True)
class HourlyRecord:
    index_id: str
    hour: datetime
    value_micro: int | None
    valid_sources: int
    status: str
    methodology_version: str
    input_hash: str
    inputs: tuple[InputRecord, ...]


def index_id_for(gpu_class: str) -> str:
    return f"gri-{gpu_class}"


def compute_hour(
    gpu_class: str,
    hour: datetime,
    observations: Mapping[str, Sequence[int]],
    methodology_version: str,
) -> HourlyRecord:
    """One class and hour. `observations` maps a source to its micro-USD prices inside the hour."""
    quotes = {source: median(list(prices)) for source, prices in observations.items()}
    result = gri(quotes, methodology_version)
    if result.value is not None:
        status = "LIVE"
    elif quotes:
        status = "INSUFFICIENT_SOURCES"
    else:
        status = "STALE"
    weight = METHODOLOGIES[methodology_version].weight
    inputs = tuple(
        InputRecord(source, quotes[source], weight(quotes[source]), source in result.kept)
        for source in sorted(quotes)
    )
    return HourlyRecord(
        index_id=index_id_for(gpu_class),
        hour=hour,
        value_micro=result.value,
        valid_sources=result.valid_sources,
        status=status,
        methodology_version=methodology_version,
        input_hash=_input_hash(gpu_class, hour, quotes, methodology_version),
        inputs=inputs,
    )


def _input_hash(
    gpu_class: str, hour: datetime, quotes: Mapping[str, int], methodology_version: str
) -> str:
    # The package version is part of the hash: a different build of the index math is a
    # different computation (PLAN 5.4).
    canonical = json.dumps(
        {
            "methodology": methodology_version,
            "package": version("siliqua-index"),
            "index": index_id_for(gpu_class),
            "hour": hour.isoformat(),
            "quotes": sorted(quotes.items()),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
