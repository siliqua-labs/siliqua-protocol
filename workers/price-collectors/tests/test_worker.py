"""End to end: mocked provider HTTP, real local Postgres, rolled back."""

import os
from datetime import UTC, datetime
from pathlib import Path

import httpx
import psycopg
import pytest
from price_collectors.registry import PROVIDERS
from price_collectors.worker import run_once

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(DATABASE_URL is None, reason="DATABASE_URL is not set")

RUNPOD = (Path(__file__).parent / "fixtures" / "runpod_catalog_recorded.json").read_bytes()
NOW = datetime(2027, 3, 10, 12, 0, tzinfo=UTC)
ENABLED = {
    "COLLECTOR_RUNPOD_ENABLED": "true",
    "RUNPOD_API_KEY": "test-key",
    "COLLECTOR_VASTAI_ENABLED": "true",
    "VASTAI_API_KEY": "test-key",
}


@pytest.fixture
def conn():
    with psycopg.connect(DATABASE_URL) as connection:
        yield connection
        connection.rollback()


def client_for(vast_status):
    def handler(request: httpx.Request) -> httpx.Response:
        if "runpod" in request.url.host:
            return httpx.Response(200, content=RUNPOD)
        return httpx.Response(vast_status, content=b"nope")

    return httpx.Client(transport=httpx.MockTransport(handler))


def stored(conn):
    return conn.execute(
        "select source_id, gpu_class from price_observations where observed_at = %s order by 1, 2",
        (NOW,),
    ).fetchall()


def test_a_failing_provider_does_not_block_the_others(conn):
    results = run_once(conn, PROVIDERS, ENABLED, client_for(500), NOW, "0.0.1")
    assert {r.provider: r.error is None for r in results} == {"runpod": True, "vastai": False}
    assert stored(conn) == [
        ("runpod", "4090"),
        ("runpod", "a100"),
        ("runpod", "b200"),
        ("runpod", "h100"),
        ("runpod", "h200"),
    ]


def test_nothing_enabled_stores_nothing(conn):
    assert run_once(conn, PROVIDERS, {}, client_for(200), NOW, "0.0.1") == []
    assert stored(conn) == []
