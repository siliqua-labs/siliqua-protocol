import pytest
from hypothesis import given
from hypothesis import strategies as st
from siliqua_index import aggregate, gri, twap
from siliqua_index.gri import median, weighted_median
from siliqua_index.rounding import div_half_up

quote = st.integers(min_value=1, max_value=10**9)
quotes_by_source = st.dictionaries(st.text(min_size=1, max_size=4), quote, max_size=12)


@given(quotes_by_source)
def test_gri_ignores_insertion_order(quotes):
    reordered = dict(reversed(list(quotes.items())))
    assert gri(quotes) == gri(reordered)


@given(quotes_by_source)
def test_gri_partitions_sources_and_stays_inside_kept_range(quotes):
    result = gri(quotes)
    assert sorted(result.kept + result.dropped) == sorted(quotes)
    assert result.valid_sources == len(result.kept)
    if result.value is None:
        assert result.valid_sources < 5
    else:
        assert result.valid_sources >= 5
        kept_quotes = [quotes[s] for s in result.kept]
        assert min(kept_quotes) <= result.value <= max(kept_quotes)


@given(st.lists(st.one_of(st.none(), quote), min_size=1, max_size=48))
def test_twap_counts_stale_hours_and_voids_above_limit(hourly):
    result = twap(hourly)
    stale = sum(v is None for v in hourly)
    assert result.stale_hours == stale
    assert result.void == (stale > 6 or stale == len(hourly))
    if not result.void:
        published = [v for v in hourly if v is not None]
        assert min(published) <= result.value <= max(published)


@given(st.lists(st.integers(min_value=0, max_value=10**9), min_size=1, max_size=15))
def test_median_is_inside_the_range(values):
    assert min(values) <= median(values) <= max(values)


@given(st.integers(min_value=0, max_value=10**12), st.integers(min_value=1, max_value=10**6))
def test_div_half_up_is_nearest_with_ties_up(numerator, denominator):
    result = div_half_up(numerator, denominator)
    assert abs(2 * numerator - 2 * result * denominator) <= denominator
    if (2 * numerator) % (2 * denominator) == denominator:
        assert result * denominator > numerator


def test_median_of_two_rounds_half_up():
    assert median([1, 2]) == 2


@given(st.lists(quote, min_size=1, max_size=15), st.integers(min_value=1, max_value=3))
def test_equal_weights_give_the_plain_median(values, weight):
    assert weighted_median([(v, weight) for v in values]) == median(values)


def test_weighted_median_follows_the_weight():
    assert weighted_median([(1, 1), (2, 1), (9, 3)]) == 9
    assert weighted_median([(1, 2), (2, 1), (4, 1)]) == 2


@pytest.mark.parametrize("bad", [0, -5, 2.5, True, "100"])
def test_gri_rejects_non_positive_or_non_integer_quotes(bad):
    with pytest.raises(ValueError, match="positive integer"):
        gri({"a": bad})


def test_gri_rejects_unknown_methodology_version():
    with pytest.raises(ValueError, match="unknown methodology version"):
        gri({"a": 1}, methodology_version="9.9")


def test_twap_rejects_empty_window():
    with pytest.raises(ValueError, match="at least one hour"):
        twap([])


oracle_values = st.lists(st.integers(min_value=1, max_value=2**128 - 1), min_size=1, max_size=3)


@given(oracle_values, st.integers(min_value=0, max_value=10_000))
def test_aggregate_partitions_values_and_ignores_order(values, tolerance):
    result = aggregate(values, tolerance)
    assert sorted(result.kept + result.dropped) == sorted(values)
    assert result == aggregate(list(reversed(values)), tolerance)


@given(oracle_values, st.integers(min_value=0, max_value=10_000))
def test_aggregate_finalizes_only_with_enough_kept_values_inside_their_range(values, tolerance):
    result = aggregate(values, tolerance)
    if result.value is None:
        assert len(result.kept) < 2
    else:
        assert len(result.kept) >= 2
        assert min(result.kept) <= result.value <= max(result.kept)


@given(oracle_values)
def test_aggregate_with_one_operator_never_finalizes(values):
    assert aggregate(values[:1]).value is None


def test_aggregate_rejects_values_outside_the_allowed_range():
    for bad in (0, -1, 2**128, 1.5):
        with pytest.raises(ValueError, match="1..2"):
            aggregate([3_500_000, bad])
