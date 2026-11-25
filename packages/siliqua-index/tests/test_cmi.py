import json
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st
from siliqua_index import Post, classify, cmi, credibility, decay_factor, largest_remainder

VECTORS = json.loads(
    (Path(__file__).parents[3] / "test-vectors" / "cmi-v1.0.json").read_text(encoding="utf-8")
)
NARRATIVES = VECTORS["narratives"]
VERSION = VECTORS["methodology_version"]
ORDER = [*NARRATIVES, "OTHER"]
HALF_LIFE = 48 * 3600


@pytest.mark.parametrize("case", VECTORS["classify"], ids=lambda case: case["name"])
def test_classify_vector(case):
    assert classify(case["scores"], NARRATIVES, case["entry_threshold_bps"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["credibility"], ids=lambda case: case["name"])
def test_credibility_vector(case):
    assert (
        credibility(case["age_days"], case["bot_bps"], case["listed"], VERSION) == case["expected"]
    )


@pytest.mark.parametrize("case", VECTORS["decay"], ids=lambda case: str(case["age_seconds"]))
def test_decay_vector(case):
    assert decay_factor(case["age_seconds"], HALF_LIFE) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["largest_remainder"], ids=lambda case: case["name"])
def test_largest_remainder_vector(case):
    assert largest_remainder(case["raw"], ORDER) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["cmi"], ids=lambda case: case["name"])
def test_cmi_vector(case):
    posts = [Post(**post) for post in case["posts"]]
    result = cmi(posts, NARRATIVES, case["day_end"], case["platforms_with_data"], VERSION)
    expected = case["expected"]
    assert result.values == expected["values"]
    assert result.stale_reason == expected["stale_reason"]
    assert result.posts_used == expected["posts_used"]


def test_classify_rejects_unknown_narrative():
    with pytest.raises(ValueError):
        classify({"NOPE": 5000}, NARRATIVES, 4000)


def test_cmi_rejects_unknown_label():
    post = Post("a", "x", 10**9, 10000, "NOPE")
    with pytest.raises(ValueError):
        cmi([post], NARRATIVES, 10**9, 3)


raw_weights = st.fixed_dictionaries({key: st.integers(0, 10**15) for key in ORDER})
posts_strategy = st.lists(
    st.builds(
        Post,
        id=st.text(min_size=1, max_size=4),
        platform=st.sampled_from(["x", "farcaster", "bluesky"]),
        created_at=st.integers(10**9 - 8 * 86400, 10**9 + 86400),
        credibility_bps=st.integers(0, 30000),
        label=st.sampled_from(ORDER),
    ),
    max_size=20,
)


@given(raw_weights.filter(lambda raw: sum(raw.values()) > 0))
def test_largest_remainder_sums_to_10000_within_one_unit(raw):
    shares = largest_remainder(raw, ORDER)
    total = sum(raw.values())
    assert sum(shares.values()) == 10_000
    for key in ORDER:
        assert abs(shares[key] * total - raw[key] * 10_000) < total


@given(posts_strategy, st.integers(0, 3))
def test_cmi_is_stale_or_sums_to_10000_and_ignores_post_order(posts, platforms):
    result = cmi(posts, NARRATIVES, 10**9, platforms)
    assert result == cmi(list(reversed(posts)), NARRATIVES, 10**9, platforms)
    if result.values is None:
        assert result.stale_reason in {"platforms", "zero_total"}
    else:
        assert platforms >= 2
        assert sum(result.values.values()) == 10_000
        assert set(result.values) == set(ORDER)


@given(st.integers(0, 10**7), st.integers(0, 10**7))
def test_decay_never_grows_with_age(a, b):
    assert decay_factor(max(a, b), 172800) <= decay_factor(min(a, b), 172800)


@given(st.dictionaries(st.sampled_from(NARRATIVES), st.integers(0, 10_000)), st.integers(0, 10_000))
def test_classify_returns_a_label_that_meets_the_threshold(scores, threshold):
    label = classify(scores, NARRATIVES, threshold)
    assert label in ORDER
    if label != "OTHER":
        assert scores[label] >= threshold
        assert scores[label] == max(scores.values())
