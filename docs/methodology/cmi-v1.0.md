# CMI methodology v1.0

Status: draft for owner review. Items marked **Proposed** are not in the owner decisions (PLAN D8, B7) and need confirmation before they are frozen. Everything else restates a binding decision.

## 1. What the index is

CMI is the share of weighted social attention each compute narrative received over a 7-day lookback, one value per UTC day.

- Unit: basis points, 0 to 10,000, no decimals. The narratives plus `OTHER` sum to exactly 10,000.
- Arithmetic: integers, plus one fixed-precision `Decimal` step for the decay (section 5). No floats.
- Functions are pure and deterministic: `packages/siliqua-index/src/siliqua_index/cmi.py`. Golden vectors: `test-vectors/cmi-v1.0.json`, run in CI.

## 2. Narratives and keywords

The narrative list and the keyword list are inputs to the function, not constants. The vectors use placeholder names (`INFRA`, `AGENTS`, `TOKENS`) that are not the product list. **Open: owner decision A10.** The final lists are published with the 500-post test report (PLAN 2.7).

`OTHER` is reserved and always present.

## 3. One post, one narrative

The frozen classifier (keywords plus model, PLAN 2.5) gives each post a score per narrative in basis points. `classify`:

1. The label is the narrative with the highest score.
2. A tie goes to the narrative that comes first in the published list.
3. If the best score is 0 or below the entry threshold, the label is `OTHER`. A score equal to the threshold enters.

The entry threshold is set during the 500-post test. **Open: owner decision.**

## 4. Credibility

`credibility` returns basis points from three inputs: account age, bot score (0 human, 10,000 bot) and the owner's tier list. Call-accuracy history is a later methodology version.

**Proposed** v1.0 parameters:

- `age_bps = max(1,000, min(age_days, 365) * 10,000 / 365)`, integer division.
- `credibility = age_bps * (10,000 - bot_bps) / 10,000`, integer division.
- A listed account is multiplied by 2.0.

A full bot weighs 0. Engagement (likes, reposts) is not used in v1.0; adding it is a new methodology version.

## 5. Decay and lookback

- Lookback: 7 days before the end of the UTC day. Posts older than that, or after the day end, are ignored. A post exactly 7 days old counts.
- `decay = 2^(-age / 48h)`, age measured to the end of the day. Computed with `Decimal` at 60 digits and rounded half up to an integer scale of 10^12, so every platform gets the same integer.
- `weight = credibility_bps * decay`.

PLAN B7 words this as `lambda = ln2/48h` in fixed point; this is the same function.

## 6. Day value

1. If fewer than 2 of the 3 platforms returned data, the day is not published: stale, reason `platforms`.
2. `raw[narrative]` = sum of weights of posts labelled with it, `OTHER` included.
3. If the total raw is 0, the day is not published: stale, reason `zero_total`.
4. Otherwise largest-remainder rounding to 10,000: each share is `raw * 10,000 / total` floored, leftover units go to the largest remainders, ties to the earlier narrative, `OTHER` last.

A stale day is never filled with a copy of the previous day.

## 7. What is published

Per post: post ID, platform, label, bot score and the classifier model hash. Never the post text. The day value is published per narrative with the methodology version.

## 8. Platforms

Farcaster (Neynar) and Bluesky are the day-one collectors. X is a separate collector, disabled by configuration until credits exist; the function does not know platform names, it only receives how many platforms returned data. With X off, both of the other two must return data for a day to publish. Costs and limits: `docs/sources.md`.

## 9. Limits

- Labels are not reproducible by a third party without the frozen model, only auditable by post ID.
- Coordinated pumping is reduced by credibility and decay, not prevented.
- The oracle has three team operators and no stake in v1 (see `/oracle`).
