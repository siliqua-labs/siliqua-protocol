"""The fixture is a recorded live response from GET /v2/catalog/gpus (2026-11-23). It is
public catalog data and holds no account details."""

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from price_collectors.observation import price_to_micro_usd
from price_collectors.providers import runpod

PAYLOAD = (Path(__file__).parent / "fixtures" / "runpod_catalog_recorded.json").read_bytes()
NOW = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)


def test_parse_keeps_only_v1_classes_at_secure_price():
    observations = runpod.parse(PAYLOAD, NOW)
    assert {o.gpu_class: o.price_micro_usd for o in observations} == {
        "4090": 890_000,
        "h100": 4_390_000,
        "h200": 5_290_000,
        "b200": 7_990_000,
        "a100": 2_190_000,
    }


def gpu_entry(body, gpu_id):
    return next(gpu for gpu in body["gpus"] if gpu["id"] == gpu_id)


def test_parse_records_payload_hash_and_time():
    observations = runpod.parse(PAYLOAD, NOW)
    assert {o.payload_sha256 for o in observations} == {hashlib.sha256(PAYLOAD).hexdigest()}
    assert {o.observed_at for o in observations} == {NOW}
    assert {o.provider for o in observations} == {"runpod"}


def test_parse_drops_a_gpu_that_is_not_in_secure_cloud():
    body = json.loads(PAYLOAD)
    gpu_entry(body, "NVIDIA GeForce RTX 4090")["secure"] = False
    observations = runpod.parse(json.dumps(body).encode(), NOW)
    assert "4090" not in {o.gpu_class for o in observations}


def test_parse_fails_clearly_when_the_schema_changes():
    body = json.loads(PAYLOAD)
    del gpu_entry(body, "NVIDIA GeForce RTX 4090")["price"]
    with pytest.raises(ValueError, match="schema changed"):
        runpod.parse(json.dumps(body).encode(), NOW)


def test_parse_rejects_a_non_numeric_price():
    body = json.loads(PAYLOAD)
    gpu_entry(body, "NVIDIA GeForce RTX 4090")["price"]["secure"] = "0.89"
    with pytest.raises(ValueError, match="not a number"):
        runpod.parse(json.dumps(body).encode(), NOW)


def test_parse_rejects_a_zero_price():
    body = json.loads(PAYLOAD)
    gpu_entry(body, "NVIDIA GeForce RTX 4090")["price"]["secure"] = 0
    with pytest.raises(ValueError, match="positive"):
        runpod.parse(json.dumps(body).encode(), NOW)


def test_price_to_micro_usd_rounds_half_up():
    assert price_to_micro_usd(Decimal("0.1234565")) == 123_457
    assert price_to_micro_usd(Decimal("0.29")) == 290_000
