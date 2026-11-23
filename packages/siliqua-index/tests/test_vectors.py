import json
from pathlib import Path

import pytest
from siliqua_index import aggregate, gri, twap

VECTORS = json.loads(
    (Path(__file__).parents[3] / "test-vectors" / "gri-v1.0.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", VECTORS["gri"], ids=lambda case: case["name"])
def test_gri_vector(case):
    result = gri(case["quotes"], VECTORS["methodology_version"])
    expected = case["expected"]
    assert result.value == expected["value"]
    assert result.valid_sources == expected["valid_sources"]
    assert list(result.dropped) == expected["dropped"]


@pytest.mark.parametrize("case", VECTORS["twap"], ids=lambda case: case["name"])
def test_twap_vector(case):
    result = twap(case["hours"])
    expected = case["expected"]
    assert result.value == expected["value"]
    assert result.stale_hours == expected["stale_hours"]
    assert result.void == expected["void"]


ORACLE_VECTORS = json.loads(
    (Path(__file__).parents[3] / "test-vectors" / "oracle-aggregation-v1.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize("case", ORACLE_VECTORS["cases"], ids=lambda case: case["name"])
def test_oracle_vector(case):
    result = aggregate(case["values"], case["toleranceBps"], case["minValues"])
    expected = case["expected"]
    assert result.median == expected["median"]
    assert list(result.kept) == expected["kept"]
    assert list(result.dropped) == expected["dropped"]
    assert result.value == expected["value"]
