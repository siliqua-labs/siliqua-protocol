"""Recompute published hours from an export and compare (PLAN 0.9).

Usage: python -m index_engine.verify EXPORT_DIR [--sample N]

Needs no database: the raw observations in the export are enough. Exit code 1 on any
mismatch, so the gate "verify reproduces 100% of sampled hours" can run in CI.
"""

import csv
import json
import random
import sys
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from importlib.metadata import version
from pathlib import Path

from index_engine.compute import compute_hour
from index_engine.export import sha256_file

MICRO = Decimal(1_000_000)


class VerifyError(Exception):
    pass


def _read(directory: Path, table: str) -> list[dict[str, str]]:
    with (directory / f"{table}.csv").open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _hour_of(text: str) -> datetime:
    return datetime.fromisoformat(text).astimezone(UTC)


def _micro(text: str) -> int:
    return int(Decimal(text) * MICRO)


def check_manifest(directory: Path) -> dict:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    for name, entry in manifest["files"].items():
        actual = sha256_file(directory / name)
        if actual != entry["sha256"]:
            raise VerifyError(f"{name}: sha256 {actual} does not match the manifest")
    return manifest


def verify(directory: Path, sample: int | None, seed: int = 0) -> tuple[int, list[str]]:
    """Return (hours checked, mismatch descriptions)."""
    manifest = check_manifest(directory)
    if manifest["siliqua_index_version"] != version("siliqua-index"):
        raise VerifyError(
            f"export was built with siliqua-index {manifest['siliqua_index_version']}, installed"
            f" is {version('siliqua-index')}: the input hash would differ by construction"
        )

    observed: dict[tuple[datetime, str], dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for row in _read(directory, "price_observations"):
        hour = _hour_of(row["observed_at"]).replace(minute=0, second=0, microsecond=0)
        observed[(hour, row["gpu_class"])][row["source_id"]].append(_micro(row["price"]))

    inputs: dict[tuple[str, datetime], set[tuple[str, int, bool]]] = defaultdict(set)
    for row in _read(directory, "gri_inputs"):
        inputs[(row["index_id"], _hour_of(row["hour"]))].add(
            (row["source_id"], _micro(row["price"]), row["kept"] == "true")
        )

    hourly = _read(directory, "gri_hourly")
    if sample is not None and sample < len(hourly):
        hourly = random.Random(seed).sample(hourly, sample)

    mismatches = []
    for row in hourly:
        hour = _hour_of(row["hour"])
        gpu_class = row["index_id"].removeprefix("gri-")
        record = compute_hour(
            gpu_class, hour, observed.get((hour, gpu_class), {}), row["methodology_version"]
        )
        stored_value = None if row["value"] == "" else _micro(row["value"])
        expected_inputs = {(i.source_id, i.price_micro, i.kept) for i in record.inputs}
        problems = []
        if record.value_micro != stored_value:
            problems.append(f"value {record.value_micro} != {stored_value}")
        if (record.valid_sources, record.status) != (int(row["valid_sources"]), row["status"]):
            problems.append("valid_sources or status")
        if record.input_hash != row["input_hash"]:
            problems.append("input_hash")
        if expected_inputs != inputs.get((row["index_id"], hour), set()):
            problems.append("inputs")
        if problems:
            mismatches.append(f"{row['index_id']} {row['hour']}: {', '.join(problems)}")
    return len(hourly), mismatches


def main(argv: Sequence[str]) -> int:
    args = list(argv)
    sample = None
    if "--sample" in args:
        at = args.index("--sample")
        try:
            sample = int(args[at + 1])
        except (IndexError, ValueError):
            print("--sample needs an integer", file=sys.stderr)
            return 2
        del args[at : at + 2]
    if len(args) != 1:
        print("usage: python -m index_engine.verify EXPORT_DIR [--sample N]", file=sys.stderr)
        return 2
    try:
        checked, mismatches = verify(Path(args[0]), sample)
    except VerifyError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    for line in mismatches:
        print(f"MISMATCH {line}", file=sys.stderr)
    print(f"checked {checked} hours, {len(mismatches)} mismatches")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
