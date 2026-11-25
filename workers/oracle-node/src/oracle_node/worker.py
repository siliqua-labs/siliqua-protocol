import logging
import os
import time
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta

import httpx
from siliqua_index import gri

from oracle_node.config import Settings, load_settings
from oracle_node.signing import (
    Report,
    SignedReport,
    encode_methodology,
    index_id_for,
    nonce_for,
    sign_report,
    signer_address,
)

log = logging.getLogger(__name__)

HOUR = timedelta(hours=1)
# docs/spec/oracle-v1.md section 3: a slot takes reports from its end until 3 hours later.
LATE_WINDOW = timedelta(hours=3)


class IndexNotReady(Exception):
    """The api has no publishable hour for this index yet. Not an error; the node waits."""


def parse_hour(raw: str) -> datetime:
    return datetime.fromisoformat(raw).astimezone(UTC)


def build_report(slug: str, detail: Mapping, now: datetime) -> Report:
    """Recompute the latest published hour from its inputs and describe it as a report.

    The value is this node's own computation over the api's per-source prices, not a copy of the
    api's published value. A difference is logged, since it means the inputs or the package differ.
    """
    sources = detail["sources"]
    if not sources:
        raise IndexNotReady(f"{slug}: no inputs for the latest hour")
    label = detail["index"]["indexId"]
    hour = parse_hour(sources[0]["fetchedAt"])
    if any(parse_hour(s["fetchedAt"]) != hour for s in sources):
        raise ValueError(f"{slug}: inputs span more than one hour")

    quotes = {s["name"]: int(s["priceMicroUsd"]) for s in sources}
    result = gri(quotes, detail["methodologyVersion"])
    if result.value is None:
        raise IndexNotReady(f"{slug}: {result.valid_sources} valid sources, not publishable")

    opens, closes = hour + HOUR, hour + HOUR + LATE_WINDOW
    if not opens <= now <= closes:
        raise IndexNotReady(f"{slug}: slot {hour.isoformat()} is outside its report window")

    published = detail["index"]["valueMicroUsd"]
    if published is not None and int(published) != result.value:
        log.warning("%s: own value %d differs from the api value %s", slug, result.value, published)

    timestamp = int(hour.timestamp())
    return Report(
        index_id=index_id_for(label),
        timestamp=timestamp,
        value=result.value,
        sources=result.valid_sources,
        methodology_version=encode_methodology(detail["methodologyVersion"]),
        nonce=nonce_for(label, timestamp),
    )


def board_payload(signed: SignedReport) -> dict:
    r = signed.report
    return {
        "report": {
            "indexId": r.index_id,
            "timestamp": str(r.timestamp),
            "value": str(r.value),
            "sources": r.sources,
            "methodologyVersion": r.methodology_version,
            "nonce": str(r.nonce),
        },
        "signature": signed.signature,
    }


def run_once(client: httpx.Client, settings: Settings, now: datetime) -> int:
    """Sign and post the latest hour of each configured index; return how many the board holds."""
    held = 0
    for slug in settings.slugs:
        try:
            response = client.get(f"{settings.api_url}/v1/indexes/{slug}")
            response.raise_for_status()
            report = build_report(slug, response.json(), now)
            signed = sign_report(
                settings.signing_key, settings.chain_id, settings.oracle_address, report
            )
            reply = client.post(
                f"{settings.api_url}/v1/reports", json={"reports": [board_payload(signed)]}
            )
            reply.raise_for_status()
        except IndexNotReady as reason:
            log.info("%s", reason)
            continue
        except httpx.HTTPError:
            log.exception("%s: api call failed", slug)
            continue
        outcome = reply.json()["results"][0]
        if outcome["outcome"] in ("accepted", "duplicate"):
            held += 1
            log.info("%s: slot %d %s", slug, report.timestamp, outcome["outcome"])
        else:
            log.error("%s: slot %d not taken by the board: %s", slug, report.timestamp, outcome)
    return held


def main(argv: Sequence[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_settings(os.environ)
    log.info(
        "operator %s, indexes %s", signer_address(settings.signing_key), ",".join(settings.slugs)
    )
    once = "--once" in argv
    with httpx.Client(timeout=30) as client:
        while True:
            started = time.monotonic()
            run_once(client, settings, datetime.now(UTC))
            if once:
                return
            time.sleep(max(0.0, settings.interval_seconds - (time.monotonic() - started)))
