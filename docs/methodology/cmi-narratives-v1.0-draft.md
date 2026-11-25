# CMI narratives and keywords, v1.0 draft

Status: **Proposed**, not an owner decision. This is a starting point for the 500-post test (PLAN 2.7), where precision per narrative decides what stays. Keywords are matched case-insensitively on whole words or phrases. A post carries at most one label (see `cmi-v1.0.md` section 3).

Order matters: on a score tie the earlier narrative wins.

| # | Label | Meaning |
| --- | --- | --- |
| 1 | `GPU_SUPPLY` | Availability, shortage and price of GPUs and cloud GPU rental |
| 2 | `DEPIN_COMPUTE` | Decentralized or tokenized compute networks |
| 3 | `AI_INFERENCE` | Serving and running models: cost, speed, open weights |
| 4 | `AI_AGENTS` | Autonomous agents that spend or need compute |
| 5 | `DATACENTER_POWER` | Data centers, energy and capital spending behind AI |
| - | `OTHER` | Reserved. Anything below the entry threshold |

## Keywords

`GPU_SUPPLY`: gpu shortage, gpu prices, gpu rental, rent gpu, gpu cloud, gpu hour, H100, H200, B200, A100, Blackwell, Hopper, nvidia supply, compute shortage, compute crunch.

`DEPIN_COMPUTE`: depin, decentralized compute, decentralized gpu, compute marketplace, akash, io.net, aethir, render network, bittensor, gpu network, compute token.

`AI_INFERENCE`: inference, inference cost, tokens per second, token price, model serving, open weights, quantization, vllm, llama, deepseek, qwen, price per million tokens.

`AI_AGENTS`: ai agent, ai agents, agentic, autonomous agent, agent economy, agent wallet, onchain agent, agent framework, x402.

`DATACENTER_POWER`: data center, datacenter, ai capex, hyperscaler, megawatt, gigawatt, power grid, nuclear ai, stargate, cooling, colocation.

## Known weak spots to test first

- `render`, `agent`, `llama` and `inference` alone are ambiguous; v1.0 uses phrases where possible and the 500-post test measures the damage.
- `AI_AGENTS` is the loosest match to "compute" and the most likely to attract promotional posts. Keep only if its precision reaches the target.
- Overlap between `GPU_SUPPLY` and `DEPIN_COMPUTE` (a post about renting GPUs on a decentralized network) is resolved by argmax scores, not by rule. Expect disagreement between labelers there.
- Ticker-only posts ($RNDR, $TAO, $AKT) are excluded from v1.0 keywords because they mostly carry price talk, not compute attention. Owner may reverse this.

## Change control

Changing this list is a methodology change: new version, announced at least 14 days before `effective_from` (PLAN B9).
