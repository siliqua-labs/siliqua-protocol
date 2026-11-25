"""Keyword classifier v1.0 (PLAN 2.5). Keywords only; the model step is not built.

The keyword table mirrors docs/methodology/cmi-narratives-v1.0-draft.md, which is a proposal
until the owner freezes it. Order is the tie-break order. Changing a keyword changes
MODEL_HASH, so every stored label can be traced to the exact table that produced it.
"""

import hashlib
import json
import re

from siliqua_index import classify

KEYWORDS = {
    "GPU_SUPPLY": [
        "gpu shortage", "gpu prices", "gpu rental", "rent gpu", "gpu cloud", "gpu hour",
        "h100", "h200", "b200", "a100", "blackwell", "hopper", "nvidia supply",
        "compute shortage", "compute crunch",
    ],
    "DEPIN_COMPUTE": [
        "depin", "decentralized compute", "decentralized gpu", "compute marketplace", "akash",
        "io.net", "aethir", "render network", "bittensor", "gpu network", "compute token",
    ],
    "AI_INFERENCE": [
        "inference", "inference cost", "tokens per second", "token price", "model serving",
        "open weights", "quantization", "vllm", "llama", "deepseek", "qwen",
        "price per million tokens",
    ],
    "AI_AGENTS": [
        "ai agent", "ai agents", "agentic", "autonomous agent", "agent economy", "agent wallet",
        "onchain agent", "agent framework", "x402",
    ],
    "DATACENTER_POWER": [
        "data center", "datacenter", "ai capex", "hyperscaler", "megawatt", "gigawatt",
        "power grid", "nuclear ai", "stargate", "cooling", "colocation",
    ],
}  # fmt: skip

NARRATIVES = list(KEYWORDS)

# Proposed: each distinct keyword found is worth 5,000 bps, capped at 10,000, so one hit is a
# weak match and two hits a full one.
BPS_PER_DISTINCT_HIT = 5_000
MAX_SCORE_BPS = 10_000

MODEL_HASH = hashlib.sha256(
    json.dumps(KEYWORDS, separators=(",", ":"), ensure_ascii=True).encode("ascii")
).hexdigest()

_PATTERNS = {
    narrative: [
        re.compile(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])") for keyword in keywords
    ]
    for narrative, keywords in KEYWORDS.items()
}


def score_text(text: str) -> dict[str, int]:
    """Score per narrative in bps; narratives with no keyword hit are left out."""
    lowered = text.lower()
    scores = {}
    for narrative, patterns in _PATTERNS.items():
        hits = sum(1 for pattern in patterns if pattern.search(lowered))
        if hits:
            scores[narrative] = min(MAX_SCORE_BPS, hits * BPS_PER_DISTINCT_HIT)
    return scores


def label_text(text: str, entry_threshold_bps: int) -> str:
    return classify(score_text(text), NARRATIVES, entry_threshold_bps)
