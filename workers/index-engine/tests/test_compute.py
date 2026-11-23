import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from index_engine.compute import compute_hour

VECTORS = json.loads(
    (Path(__file__).parents[3] / "test-vectors" / "gri-v1.0.json").read_text(encoding="utf-8")
)
HOUR = datetime(2026, 11, 23, 10, tzinfo=UTC)


def expected_status(case):
    if case["expected"]["value"] is not None:
        return "LIVE"
    return "INSUFFICIENT_SOURCES" if case["quotes"] else "STALE"


@pytest.mark.parametrize("case", VECTORS["gri"], ids=lambda case: case["name"])
def test_engine_agrees_with_the_shared_vectors(case):
    observations = {source: [price] for source, price in case["quotes"].items()}
    record = compute_hour("h100", HOUR, observations, VECTORS["methodology_version"])
    assert record.value_micro == case["expected"]["value"]
    assert record.valid_sources == case["expected"]["valid_sources"]
    assert record.status == expected_status(case)
    dropped = sorted(i.source_id for i in record.inputs if not i.kept)
    assert dropped == case["expected"]["dropped"]


def test_a_sources_quote_is_the_median_of_its_observations_in_the_hour():
    observations = {s: [2_000_000] for s in "abcd"} | {"e": [1_000_000, 2_000_000, 9_000_000]}
    record = compute_hour("h100", HOUR, observations, "1.0")
    quote_e = next(i for i in record.inputs if i.source_id == "e")
    assert quote_e.price_micro == 2_000_000
    assert record.value_micro == 2_000_000


def test_inputs_carry_weight_and_the_kept_flag():
    observations = {s: [2_000_000] for s in "abcde"} | {"f": [3_900_000]}
    record = compute_hour("h100", HOUR, observations, "1.0")
    assert [(i.source_id, i.weight, i.kept) for i in record.inputs] == [
        ("a", 1, True),
        ("b", 1, True),
        ("c", 1, True),
        ("d", 1, True),
        ("e", 1, True),
        ("f", 1, False),
    ]


def test_an_hour_with_no_data_is_stale_and_has_no_inputs():
    record = compute_hour("h100", HOUR, {}, "1.0")
    assert (record.status, record.value_micro, record.inputs) == ("STALE", None, ())


def test_record_names_the_index_and_hour():
    record = compute_hour("4090", HOUR, {}, "1.0")
    assert (record.index_id, record.hour, record.methodology_version) == ("gri-4090", HOUR, "1.0")


def test_input_hash_is_stable_and_follows_the_inputs():
    base = {s: [2_000_000] for s in "abcde"}
    first = compute_hour("h100", HOUR, base, "1.0").input_hash
    assert compute_hour("h100", HOUR, base, "1.0").input_hash == first
    changed = base | {"a": [2_000_001]}
    assert compute_hour("h100", HOUR, changed, "1.0").input_hash != first
    assert compute_hour("h200", HOUR, base, "1.0").input_hash != first


def test_unknown_methodology_version_fails():
    with pytest.raises(ValueError, match="unknown methodology version"):
        compute_hour("h100", HOUR, {"a": [1]}, "9.9")
