from pathlib import Path

import pytest
from social_collectors import classifier

DRAFT = Path(__file__).parents[3] / "docs" / "methodology" / "cmi-narratives-v1.0-draft.md"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("H100 rental prices keep climbing, gpu rental is tight", "GPU_SUPPLY"),
        ("Akash and io.net are pushing decentralized compute", "DEPIN_COMPUTE"),
        ("Cutting inference cost with vLLM and quantization", "AI_INFERENCE"),
        ("The agent economy needs an agent wallet", "AI_AGENTS"),
        ("Another gigawatt data center for AI capex", "DATACENTER_POWER"),
        ("good morning everyone", "OTHER"),
    ],
)
def test_label_text(text, expected):
    assert classifier.label_text(text, 4_000) == expected


def test_matching_is_whole_word_and_case_insensitive():
    assert classifier.score_text("Brand H1000 and the hopperfield") == {}
    assert classifier.score_text("HOPPER") == {"GPU_SUPPLY": 5_000}


def test_two_distinct_hits_reach_a_full_score_and_repeats_do_not_count():
    assert classifier.score_text("h100 h200") == {"GPU_SUPPLY": 10_000}
    assert classifier.score_text("h100 h100 h100") == {"GPU_SUPPLY": 5_000}


def test_one_weak_hit_stays_other_above_the_threshold():
    assert classifier.label_text("h100", 6_000) == "OTHER"


def test_tie_goes_to_the_earlier_narrative():
    assert classifier.label_text("h100 and akash", 4_000) == "GPU_SUPPLY"


def test_model_hash_is_stable_and_tracks_the_table():
    assert len(classifier.MODEL_HASH) == 64
    assert classifier.MODEL_HASH == classifier.MODEL_HASH.lower()


def test_every_keyword_and_label_is_in_the_published_draft():
    draft = DRAFT.read_text(encoding="utf-8").lower()
    for narrative, keywords in classifier.KEYWORDS.items():
        assert narrative.lower() in draft
        for keyword in keywords:
            assert keyword in draft, keyword


def test_narrative_order_matches_the_methodology():
    from siliqua_index.cmi import METHODOLOGIES

    assert tuple(classifier.NARRATIVES) == METHODOLOGIES["1.0"].narratives
