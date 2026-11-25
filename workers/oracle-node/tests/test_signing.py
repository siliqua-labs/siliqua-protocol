"""The fixture was signed with viem and is checked by Foundry (contracts/test/Signatures.t.sol).
Matching it byte for byte is what proves eth-account and the contract agree."""

import json
from pathlib import Path

import pytest
from oracle_node.signing import (
    Report,
    encode_methodology,
    index_id_for,
    nonce_for,
    sign_report,
    signer_address,
)

FIXTURE = json.loads(
    (Path(__file__).parents[3] / "test-vectors" / "oracle-signatures-v1.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["name"])
def test_signature_and_digest_match_the_fixture(case):
    r = case["report"]
    report = Report(
        index_id=r["indexId"],
        timestamp=int(r["timestamp"]),
        value=int(r["value"]),
        sources=r["sources"],
        methodology_version=r["methodologyVersion"],
        nonce=int(r["nonce"]),
    )
    signed = sign_report(FIXTURE["privateKey"], FIXTURE["chainId"], FIXTURE["oracle"], report)
    assert signed.digest == case["digest"]
    assert signed.signature == case["signature"]


def test_signer_address_matches_the_fixture():
    assert signer_address(FIXTURE["privateKey"]) == FIXTURE["signer"]


def test_index_id_is_keccak_of_the_label():
    assert index_id_for("GRI-H100") == FIXTURE["cases"][0]["report"]["indexId"]


def test_methodology_encoding():
    assert encode_methodology("1.0") == 10_000
    assert encode_methodology("2.3") == 20_003
    with pytest.raises(ValueError, match="look like"):
        encode_methodology("v1")


def test_nonce_is_stable_per_slot_and_differs_across_indexes_and_slots():
    assert nonce_for("GRI-H100", 3600) == nonce_for("GRI-H100", 3600)
    assert nonce_for("GRI-H100", 3600) != nonce_for("GRI-A100", 3600)
    assert nonce_for("GRI-H100", 3600) != nonce_for("GRI-H100", 7200)
    assert nonce_for("GRI-H100", 3600) < 2**256


def test_resigning_a_slot_gives_the_same_signature():
    report = Report(index_id_for("GRI-H100"), 3600, 2_400_000, 6, 10_000, 7)
    key, chain, oracle = FIXTURE["privateKey"], FIXTURE["chainId"], FIXTURE["oracle"]
    assert sign_report(key, chain, oracle, report) == sign_report(key, chain, oracle, report)
