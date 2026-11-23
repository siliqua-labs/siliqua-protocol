from collections.abc import Sequence

import httpx

from siliqua_watchdog.checks import Finding


def send_alert(client: httpx.Client, webhook_url: str, findings: Sequence[Finding]) -> None:
    """POST the findings as `{"text": ...}`. The receiving service is the owner's choice."""
    text = "Siliqua watchdog\n" + "\n".join(f"- {finding.message}" for finding in findings)
    response = client.post(webhook_url, json={"text": text}, timeout=15)
    response.raise_for_status()
