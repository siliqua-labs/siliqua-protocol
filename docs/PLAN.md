# Siliqua - Implementation Plan (v1)

Status: awaiting owner approval of v1. No phase has been started.
Revision: v1 incorporates the owner decisions of 2026-11-21 (section 2.3).
Tags: **[verified]** read from an official source; **[unverified]** from a third-party source or memory, to be confirmed before use; **[H]** needs human input.

## 1. Understanding of the product

1. Siliqua publishes two on-chain indexes on Robinhood Chain: GRI (median on-demand GPU rental price, USD per GPU-hour, per GPU class) and CMI (share of social attention per compute narrative, 0-10,000 bps).
2. Both are pure functions of public raw data, so anyone can recompute them.
3. Three operators, all from our own team and on an allowlist managed by a multisig, each sign their own computed value (EIP-712). `SiliquaOracle` drops values deviating more than 1% from the median, needs at least 2 left, and stores the median.
4. A GRI class with too few valid sources is not published; the previous value is marked stale.
5. v1 market: weekly parimutuel YES/NO in USDG. It closes 24h before a 24h TWAP window; settlement is that TWAP (`> threshold` is YES, equal is NO); void and full refund if cumulative stale time in the window exceeds 6h.
6. Fee is 2% of the losing pool, charged at settle and split by `FeeRouter` to three addresses (50/30/20). `FeeRouter` never swaps or burns. Market contracts are immutable and pinned to one oracle address; `pause` stops only `buy`.
7. $SILQ and its launch are outside this repo (address is configuration only). v1 has no staking and no slashing.
8. Order: Data, Oracle on-chain, CMI, Market. Money enters only in the last phase, after legal review and audit.
9. Hosting: Next.js on Vercel, Supabase as plain Postgres, Railway for API, indexer, keeper and workers; one Railway project per operator.
10. Limits to publish honestly: the three operators are one team (trust in the team, no economic security), and the contracts cannot enforce geoblocks.

## 2. Conflicts and gaps

### 2.0 Materials

| Finding                                                                                            | Effect                                                                                       |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Brief now at `docs/brief/Siliqua Developer Brief.md` (earlier at `docs/`); same size, 12,144 bytes | I read the earlier copy; content assumed identical.                                          |
| `docs/references/` exists but is empty (owner: to follow)                                          | Section 6 is not inferred from references. **[H]** add files; I revise section 6 afterwards. |
| Brief has an embedded architecture diagram placeholder                                             | Unreadable; I rely on the text.                                                              |
| Folder is not a git repository                                                                     | `git init` needed for the commit hook.                                                       |
| `.claude/settings.json` has `includeCoAuthoredBy: false`                                           | Deprecated key [verified]; merged with `attribution`.                                        |
| `caveman` README mentions `ultracave` and `megacave`                                               | Not installed, cannot be read.                                                               |

### 2.1 Brief vs final decisions (final wins)

| Brief says                                                         | Final decision                              | Resolution                                                              |
| ------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| CMI reuses $NTI                                                    | Built from scratch                          | No $NTI code or assumptions.                                            |
| TimescaleDB                                                        | Plain Postgres                              | Monthly partitions plus hour/day rollups.                               |
| Refund "if stale at settle" (interface comment) vs 6h rule in text | Cumulative stale over 6h in the TWAP window | Fix the `refundIfVoid` comment.                                         |
| `FeeRouter` does buyback                                           | Only splits to three addresses              | Buyback/burn is a manual treasury step; documented trust assumption.    |
| Bet cap 1,000 USDG, fee 2%                                         | Template parameters in `MarketFactory`      | Parameters, not constants.                                              |
| Operators stake $SILQ and are slashed                              | v1 has none                                 | Owner decision D2; limit is stated on `/oracle` and `/methodology`.     |
| Telegram as a CMI platform                                         | X, Farcaster, Bluesky; Telegram optional    | D9.                                                                     |
| `oracle-node` in TypeScript                                        | `oracle-node` in Python (D7)                | Stack table updated; `api`, `indexer`, `market-keeper` stay TypeScript. |

### 2.2 Holes found in the brief (numbered; resolution in 2.3)

1. Staking vs roadmap order (token launches in Phase 3, oracle in Phase 1; "proven wrong" undefined). -> D2.
2. Report format vs tolerance (single value struct vs "match within tolerance" and a 0.5% gate). -> D1.
3. Operator independence is thin if all use one shared database. -> open Q-A6.
4. Index math in Python and `oracle-node` in TypeScript would drift. -> D7.
5. Definition of one GPU unit (SXM/PCIe, memory size, node price split, region, spot vs on-demand, marketplace listings). -> open Q-B1.
6. Source weight saturates at about 99 GPUs and availability is self-reported; `log10` in floats is not reproducible. -> D4.
7. "5 valid sources" before or after the outlier filter. -> open Q-B2.
8. MAD = 0 and unscaled `3*MAD` is about 2 sigma. -> D3.
9. Empty hours in TWAP; "stale over 6h" cumulative or contiguous; stale age for `latest()`. -> D5.
10. Late and back-dated reports could change a result after settle. -> D5.
11. Replay protection and signature domain. -> D1 (EIP-712 with nonce); details in open Q-N4.
12. Empty pool and tie in the market. -> D5, CLAUDE.md (Q-N2 confirmed 2026-11-26).
13. Payout rounding and dust. -> rule in CLAUDE.md; fuzz invariant in 3.2.
14. Fee transfer must not block settle. -> fee accrues in the market and is swept by anyone.
15. Upgradeable oracle vs immutable market. -> D6.
16. Operator or provider bans on betting cannot be enforced on-chain; per-address cap is a speed bump. -> risk table.
17. Geoblock covers only our frontend and API. -> risk table.
18. Who picks threshold X and market times. -> open Q-B6.
19. CMI normalization, multi-label, zero-day, rounding, window. -> D8 (window and half-life: open Q-B7).
20. CMI is not fully third-party reproducible (classifier, bot score). -> D8: publish labels, scores and model hash; the labelling step stays non-reproducible and is said so.
21. A daily CMI has no meaningful 24h TWAP; no CMI market in v1. -> no CMI market template until defined.
22. "Min 3 platforms" with an outage. -> open Q-B7.
23. Publishing raw provider prices may breach provider terms. -> open Q-A4.
24. Gates take wall-clock time (30 + 14 days). -> D13.
25. Velamen/Stigmer dependency has no spec. -> open Q-A12.
26. USDG issuer can freeze balances. -> risk table.
27. API details unspecified (intervals, pagination, errors). -> defaults Q-B8.
28. Robinhood Chain facts absent from the brief. -> D10.

### 2.3 Owner decisions (2026-11-21), now binding

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Each operator signs its own value (EIP-712 struct: `indexId, timestamp, value, sources, methodologyVersion, nonce`). The contract drops values deviating from the median of the submitted values by more than the tolerance (1%, a parameter), needs at least 2 left, and stores the median (2 values: mean, rounded half up). Every per-operator value is emitted in an event, so the 0.5% spread gate is measured from events, not from rejections. |
| D2  | No stake or slashing in v1. Operators are an allowlist managed by the multisig. The limit is written on `/oracle` and `/methodology`. Owner informs the head dev.                                                                                                                                                                                                                                                                                     |
| D3  | Outlier bound: `3 * max(1.4826 * MAD, 1% of median)`. Published as methodology v1.0.                                                                                                                                                                                                                                                                                                                                                                  |
| D4  | All sources have `w = 1` in v1. The weight function is replaceable through a methodology version. All index arithmetic uses integers or `Decimal`, never floats.                                                                                                                                                                                                                                                                                      |
| D5  | TWAP: empty hours are skipped and counted as stale. "Stale over 6h" is cumulative inside the 24h TWAP window. The oracle accepts late reports up to 3h. `settle()` is callable only after `settleTime + 3h`. `TWAP > threshold` is YES; equal is NO. Empty pools follow CLAUDE.md.                                                                                                                                                                    |
| D6  | Registry, no proxy. Each market pins the oracle address at creation. No admin path rescues a running market; this is a conscious decision.                                                                                                                                                                                                                                                                                                            |
| D7  | One pure Python package for index math, used by `index-engine` and `oracle-node`. `oracle-node` is written in Python. Shared golden vectors run in CI.                                                                                                                                                                                                                                                                                                |
| D8  | CMI: one post, one narrative (argmax; below an entry threshold goes to OTHER). A day with total raw 0 is not published and is marked stale. Largest-remainder rounding so values sum to 10,000. Publish post ID, label, bot score and model hash, not post text.                                                                                                                                                                                      |
| D9  | Social platforms: X, Farcaster, Bluesky. Telegram optional for selected public channels. Terms and costs of each platform are verified from official docs and written to `docs/sources.md`; I then ask about costs.                                                                                                                                                                                                                                   |
| D10 | Chain IDs 4663 (mainnet) and 46630 (testnet) come from several third-party sources and stay tagged "not yet matched against docs.robinhood.com/chain" until the owner checks. Everything is configuration. USDG address and decimals are not filled in: read `decimals()` from the contract and validate it. Use `block.timestamp`, not block numbers. Verify contracts through Blockscout.                                                           |
| D11 | Merge `attribution {commit:"", pr:""}` into existing settings. Keep the `commit-msg` hook.                                                                                                                                                                                                                                                                                                                                                            |
| D12 | Caveman and similar styles apply only to chat replies, never to repo files. Ponytail `ultra` is restricted and may not contest final decisions. No `graphify hook install`; use `.githooks` with `core.hooksPath`, and run graphify manually at each phase change. Any graphify change to `CLAUDE.md` goes through diff review only.                                                                                                                  |
| D13 | Overlapped plan approved. Price collectors are priority one because the 30-day clock starts only when collectors are live. The 14-day Phase 1 gate may run on testnet during the second half of the 30-day window.                                                                                                                                                                                                                                    |

## 3. Open questions

### (a) Blockers

| #   | Needed before                    | Question                                                                                                                                                                                                                                    | Proposed default                                                                                                                                                                                                                            |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Frontend (Phase 0 UI)            | Add files to `docs/references/` (images, video, links).                                                                                                                                                                                     | Data layer, API and engine first; UI after the files arrive.                                                                                                                                                                                |
| A2  | Foundation                       | OK to run `git init`, use GitHub + GitHub Actions, set `core.hooksPath`? Repo name and remote?                                                                                                                                              | Yes; no push without your word.                                                                                                                                                                                                             |
| A4  | Phase 0 start                    | GPU provider accounts and keys (you). Who reviews each provider's terms on storing, republishing and derived use? May we publish raw per-source prices?                                                                                     | I produce `docs/sources.md` per provider (API, auth, limits, price semantics, terms, links); you decide per source. A source whose terms forbid republishing still feeds the index but appears only in aggregate, marked on `/methodology`. |
| A6  | Phase 1                          | Do operators run their own collectors, or all read one shared raw snapshot (hash committed in each report)?                                                                                                                                 | Shared snapshot in v1, published as "independent compute, shared data"; own collectors for at least 2 sources per operator later.                                                                                                           |
| A7  | Phase 1 testnet, Phase 3 mainnet | You will check chain facts against official docs: chain IDs, RPC, Blockscout URL (sources disagree: `robinhoodchain.blockscout.com` vs `robinscan.io`), USDG address and `decimals()`, availability of a Safe-like multisig and a timelock. | All in per-environment config with a `verified` flag; deploy scripts refuse mainnet while any flag is false.                                                                                                                                |
| A8  | Phase 1 mainnet                  | Signing key as a Railway env var is readable by project members. Accept for v1?                                                                                                                                                             | Yes: dedicated key per operator, gas only, rotation runbook; KMS later.                                                                                                                                                                     |
| A9  | Phase 2                          | After `docs/sources.md` lists X, Farcaster and Bluesky terms and costs, approve the budget.                                                                                                                                                 | I report first, you decide.                                                                                                                                                                                                                 |
| A10 | Phase 2                          | Who labels the 500-post test; who owns the initial KOL list and its governance?                                                                                                                                                             | Two team labelers with 250 overlapping posts for agreement; KOL list and tiers from you, published.                                                                                                                                         |
| A11 | Phase 3                          | Jurisdictions, counsel, audit firm and budget.                                                                                                                                                                                              | Mainnet in Phase 3 does not start without these; testnet work is not blocked.                                                                                                                                                               |
| A12 | Phase 1 gate                     | Who writes the Velamen and Stigmer integration, and through which interface (Solidity read, API, both)?                                                                                                                                     | I ship a read-only example consumer and docs; the integration is theirs.                                                                                                                                                                    |

### (b) Needs confirmation or has a default

| #   | Topic                                                                                                           | Proposed default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N1  | Minimum sources                                                                                                 | At least 5 sources with a fresh quote before the outlier filter and at least 4 after it, per class; below that the hour is not published.                                                                                                                                                                                                                                                                                                                                                                                |
| N2  | Rules I wrote into CLAUDE.md that you referenced but had not yet defined: empty-pool handling and TWAP rounding | Empty winning side: void and full refund, no fee. Empty losing side: winners get stake back, no fee. Fee dust goes to `FeeRouter`. TWAP rounds half up. Confirmed 2026-11-26.                                                                                                                                                                                                                                                                                                                                            |
| N3  | Meaning of the 30-day gate                                                                                      | Because index values are a pure function of raw data, the gate counts raw-data coverage (no gap over 6h per class with at least 5 sources) and requires that backfilled hourly values equal live ones.                                                                                                                                                                                                                                                                                                                   |
| N4  | Oracle mechanics beyond D1                                                                                      | Reports go in a batch `submit(Report[], bytes[])` by anyone; a slot is finalized by the first batch leaving at least 2 values and is then immutable; `nonce` is a unique per-operator value tracked in a bitmap (not monotonic); `methodologyVersion` must be identical across the batch and registered by the multisig. Late-report window: slot `t` accepts reports until `t + 1h + 3h`. Operators exchange signed reports through a small write endpoint on `api` so batching works across separate Railway projects. |
| N5  | Operator set changes                                                                                            | Addition through the timelock, removal immediate by multisig.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B1  | GPU unit                                                                                                        | One GPU, on-demand, no commitment, USD. Class = one SKU: H100 80GB SXM, H200 SXM, B200, A100 80GB, RTX 4090 24GB; PCIe and other variants excluded in v1. Multi-GPU node price divided by GPU count only if the price covers GPUs alone or a per-GPU price is listed. Marketplaces (Vast.ai) count as one source: median of reliable on-demand offers. Spot and interruptible excluded. SKU table versioned and published.                                                                                               |
| B6  | Threshold and times                                                                                             | Keeper proposes threshold = last GRI rounded to $0.05, creates through a permissioned `createMarket`, announces before opening. Opens Friday, closes Wednesday, TWAP window Thursday to Friday (all template parameters).                                                                                                                                                                                                                                                                                                |
| B7  | CMI details                                                                                                     | Lookback 7 days, decay measured to end of day, half-life 48h, `lambda = ln2/48h` in fixed-point; entry threshold for OTHER set during the 500-post test; a day is published if at least 2 of 3 platforms returned data; credibility v1 = account age + bot score + owner tier list, call-accuracy history later.                                                                                                                                                                                                         |
| B8  | API                                                                                                             | Intervals `1h` and `1d`; cursor pagination; errors `{error:{code,message}}`; every response carries `methodologyVersion`; 60 requests/min per IP free, key for more later; CORS open for GET.                                                                                                                                                                                                                                                                                                                            |
| B9  | Methodology changes                                                                                             | `effective_from >= announced_at + 14 days`, enforced in code.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B10 | Retention                                                                                                       | Raw provider payloads 90 days (drop partitions); normalised inputs and index values forever.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B11 | Redis                                                                                                           | Railway Redis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| B13 | Bet cap                                                                                                         | 1,000 USDG per address per market, factory parameter expressed in whole tokens and scaled by the validated `decimals()`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| B14 | License                                                                                                         | All rights reserved until decided, before first public push.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 4. Implementation plan by phase

Legend: [H] needs human input. "Owner" tasks are written by you; I help on request only. Until then I prepare specs, vectors and consumers.

Timeline (D13). Day 0 is the first day collectors run with at least 5 sources for at least one class.

- Before Day 0: minimum Foundation and collectors only.
- Day 0 to 30: Phase 0 engine, API, UI; Phase 1 contracts and `oracle-node` written; Phase 2 research and API access.
- Day 16 onward: Phase 1 testnet with 3 operators, so its 14-day gate completes with the 30-day window.
- After both gates: Phase 1 mainnet. Phase 2 build overlaps. Phase 3 contract work can start once Phase 1 interfaces freeze; launch waits for legal and audit.

### Phase F - Foundation

Goal: reproducible repo with enforced rules. Cut in two so collectors are not delayed.

F-first (before collectors): F1 git setup, F2 settings merge, F3 `CLAUDE.md`, F4a Python skeleton (uv workspace, ruff, pytest), F6a raw-observation table migration and local Postgres, F8 typed env loader, F10 Supabase and Railway projects.
F-rest (in parallel with Phase 0): F4b TS workspace and Biome, F5 Foundry project, F6b remaining baseline schema with RLS, F7 full CI, F9 doc-check notes.

| #   | Task                                                                                                                                                       | Depends on   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| F1  | `git init`, `.gitignore` (secrets, `graphify-out/`, build output), `.gitattributes` (LF for hooks), `.githooks/commit-msg`, shell test                     | A2           |
| F2  | Merge `.claude/settings.json`                                                                                                                              | -            |
| F3  | Root `CLAUDE.md`                                                                                                                                           | -            |
| F4  | Monorepo skeleton (5.1)                                                                                                                                    | F1           |
| F5  | `contracts/` Foundry, forge-std pinned                                                                                                                     | F1           |
| F6  | `db/migrations`: baseline (5.3), RLS on every table with no public policy, partition helper; docker compose Postgres                                       | F4           |
| F7  | CI (5.6)                                                                                                                                                   | F4-F6        |
| F8  | Per-service typed env loader that fails fast; `.env.example` per service                                                                                   | F4           |
| F9  | `docs/decisions/`: doc checks for Next.js, Vercel, Supabase pooler, Railway (cron interval, restarts, private networking), Foundry Blockscout verification | -            |
| F10 | Create Vercel, Supabase, Railway projects                                                                                                                  | [H] accounts |

Done when: clean clone runs `pnpm install && uv sync && forge build && forge test` green locally and in CI; hook test rejects `Co-Authored-By: Claude` and "Generated with" and accepts a valid Conventional Commit; migrations apply to an empty Postgres; no secret in history.
Risks: CRLF breaking the hook on Windows; pooler behaviour differing from direct connections.

### Phase 0 - Data

Goal: a trustworthy public GRI off-chain and proof of 30 days of continuity. Order is deliberate: collectors first.

| #   | Task                                                                                                                                                                                                                                                                                             | Depends on            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 0.1 | Provider survey: API, auth, limits, price semantics, availability field, terms (store, republish, derived). Output `docs/sources.md` (GPU section; social section added in Phase 2). Brief candidates (Texel, RunPod, Lambda, Vast.ai, DePIN marketplaces) are **[unverified]**; search for more | [H] A4                |
| 0.2 | `price-collectors`: one module per provider on a common runner, 10-minute cadence, schema validation, payload hash, explicit failure and metrics, recorded-response fixtures. **Priority one; Day 0 starts when at least 5 sources are live**                                                    | 0.1, F6a [H] keys     |
| 0.3 | `watchdog` minimum: raw-coverage gaps per class, source freshness, alert                                                                                                                                                                                                                         | 0.2 [H] alert channel |
| 0.4 | Methodology v1.0 (`docs/methodology/gri-v1.0.md`): SKU table, outlier bound (D3), `w = 1` with weight function selected by methodology version (D4), integer or `Decimal` rounding rules, TWAP and stale rules (D5), minimum-source rule (N1)                                                    | 0.1                   |
| 0.5 | Python package `siliqua-index`: pure `gri()` and `twap()` with integers or `Decimal`, no floats; golden vectors (JSON); property tests (permutation invariance, outlier resistance, MAD = 0 case, monotonicity)                                                                                  | 0.4                   |
| 0.6 | `index-engine`: hourly GRI with backfill from raw data; writes value, status, inputs, methodology version; rollups; classes under the minimum not published                                                                                                                                      | 0.2, 0.5              |
| 0.7 | `api` read endpoints: `/v1/index`, `/history`, `/sources`, `/methodology` (Redis cache, rate limit)                                                                                                                                                                                              | 0.6                   |
| 0.8 | Web: `/`, `/gpu/{class}`, `/methodology` (states the v1 oracle limits)                                                                                                                                                                                                                           | 0.7, A1               |
| 0.9 | Raw-data export (monthly snapshot + SHA-256 manifest) and a `verify` script that recomputes any hour                                                                                                                                                                                             | 0.6, A4               |

Done when: at least 5 sources live for each qualifying class (others explicitly unpublished); 30 days with no raw-coverage gap over 6h (N3), measured by a watchdog query; backfilled values equal live values; `verify` reproduces 100% of sampled hours exactly; methodology page live.
Risks: under 5 sources for B200 and maybe H200 (unpublished is a valid outcome); API change or key revocation; marketplace price semantics; terms forbidding republication.

### Phase 1 - Oracle on-chain

Goal: 3 operators publish signed GRI; consumers can read it. Testnet gate may overlap Phase 0 (D13).

| #   | Task                                                                                                                                                                                                                              | Depends on         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1.1 | Oracle spec: EIP-712 domain and struct (D1), median and outlier-drop algorithm with worked examples, slot and late-report rules (D5, N4), nonce, operator allowlist (D2, N5), registry (D6), events including per-operator values | 0.4                |
| 1.2 | `SiliquaOracle` + registry with Foundry unit, fuzz and invariant tests (owner). Shared JSON vectors read by `forge test` and by a Python model of the aggregation                                                                 | 1.1                |
| 1.3 | `oracle-node` in Python: read snapshot, run `siliqua-index`, sign EIP-712, post to the report board, retry, health endpoint. Cross-language check: Python-signed fixtures verified in Foundry                                     | 1.1, 0.6           |
| 1.4 | Report board endpoint in `api` and batch relayer (N4); alert if a slot is not finalized                                                                                                                                           | 1.1                |
| 1.5 | `indexer` (TS): events to Postgres with reorg handling, per-operator values stored                                                                                                                                                | 1.2                |
| 1.6 | Testnet deploy, 3 operator Railway projects with separate keys, Blockscout verification                                                                                                                                           | A7, A8, F10        |
| 1.7 | `api` on-chain status; `/oracle` page: operators, per-operator values, finalized value, spread, rejected reports, plain statement of v1 limits                                                                                    | 1.5                |
| 1.8 | Read-only example consumer + docs for Velamen/Stigmer                                                                                                                                                                             | 1.2, A12           |
| 1.9 | Mainnet deploy with multisig + timelock admin; operator addresses published                                                                                                                                                       | [H] A7, both gates |

Done when: 14 days of on-chain reports (testnet allowed); max pairwise operator spread under 0.5% per slot, computed from per-operator events; replay, duplicate, wrong-signer, late and outlier cases covered by tests and visible on `/oracle`; one operator-offline drill (2 of 3 still finalize) and one key-rotation drill.
Risks: Python EIP-712 and `web3` behaviour differing from Solidity (mitigated by cross-language fixtures); Orbit specifics (verify `block.timestamp` behaviour); relayer liveness; env-var key custody; weak independence; with only two surviving values, two colluding operators can set the value; no audit planned for the oracle in the brief, so I recommend an independent review before mainnet.

### Phase 2 - CMI

Goal: daily CMI with a published, tested method.

| #   | Task                                                                                                                                                            | Depends on  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 2.1 | CMI v1 spec (D8, B7), published keyword list                                                                                                                    | -           |
| 2.2 | Verify X, Farcaster, Bluesky terms and costs from official docs into `docs/sources.md`; Telegram assessment; then ask owner about costs                         | A9          |
| 2.3 | `social-collectors` (X, Farcaster, Bluesky; Telegram optional) and bot filter; store IDs, labels, scores, model hash, not post text                             | 2.2         |
| 2.4 | Credibility and engagement scoring (B7)                                                                                                                         | 2.1         |
| 2.5 | Classifier: keywords + model, frozen and versioned, label per post stored as index input                                                                        | 2.1         |
| 2.6 | CMI in `siliqua-index` (argmax label, OTHER, zero-day stale, largest-remainder rounding) + vectors + property tests; daily job in `index-engine`                | 2.1         |
| 2.7 | 500-post manual test: precision and recall per narrative, inter-labeler agreement; targets set by owner first (proposal: precision at least 0.85 per narrative) | [H] A10     |
| 2.8 | On-chain CMI through the same oracle path; `/narratives` heatmap and endpoints                                                                                  | Phase 1, A1 |

Done when: methodology and keyword list published; 500-post report published with numbers, failures included; at least 7 days of daily CMI with per-platform health visible.
Risks: platform cost, terms and blocking; classifier drift; coordinated pumping (reduced, not removed); subjective labels.

### Phase 3 - Market

Goal: weekly GRI-H100 market on testnet, then mainnet with caps, only after the Go/No-Go list.

| #    | Task                                                                                                                                                                                                                                                             | Depends on |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 3.1  | Market spec: timeline (B6), `settle` after `settleTime + 3h`, void rule, tie and empty-pool rules (CLAUDE.md), parameters, events                                                                                                                                | Phase 1    |
| 3.2  | `MarketFactory`, `RangeMarket`, `FeeRouter` with unit, fuzz, invariant tests (owner). Invariants: claims plus refunds never exceed balance; `claim` and `refundIfVoid` never blocked by pause; no state where funds cannot leave; decimals validated at creation | 3.1        |
| 3.3  | `market-keeper` (TS): create, settle, sweep fees, alert on missed deadlines                                                                                                                                                                                      | 3.2        |
| 3.4  | Indexer and API for markets (`/v1/markets`, implied odds)                                                                                                                                                                                                        | 3.2        |
| 3.5  | `/markets`: wallet connect, buy, claim, refund, countdowns, void banner; geoblock on frontend and API                                                                                                                                                            | A1, 3.4    |
| 3.6  | $SILQ address and FeeRouter recipients into config (head dev delivers)                                                                                                                                                                                           | [H]        |
| 3.7  | Legal review                                                                                                                                                                                                                                                     | [H] A11    |
| 3.8  | Contract audit                                                                                                                                                                                                                                                   | [H] A11    |
| 3.9  | Testnet rehearsal: at least 3 weekly cycles including forced void, tie (equal means NO), empty pools                                                                                                                                                             | 3.3-3.5    |
| 3.10 | Go/No-Go checklist from brief plus: caps active, multisig and timelock, pause drill                                                                                                                                                                              | 3.7-3.9    |

Done when: all Go/No-Go boxes have evidence; audit findings fixed or accepted in writing; rehearsal log shows every branch end to end.
Risks: legal outcome may change scope; thin liquidity; USDG freeze; sybil around caps; a wrong oracle value cannot be rescued by design (D6).

## 5. Repo structure and technical decisions

### 5.1 Layout and tooling

```
apps/web                  Next.js (Vercel)
services/api              TS, Railway
services/indexer          TS, Railway
services/market-keeper    TS, Railway
services/oracle-node      Python, one Railway project per operator
workers/price-collectors  Python
workers/social-collectors Python
workers/index-engine      Python
workers/watchdog          Python
packages/siliqua-index    Python, pure index math, shared
packages/chain            TS: ABIs, per-environment chain config with verified flags
packages/db               TS: DB types and query helpers
contracts/                Foundry
db/migrations/            plain SQL, source of truth for both languages
test-vectors/             shared golden vectors (index math, oracle aggregation)
docs/                     brief, plan, methodology, sources, decisions
```

| Choice                       | Pick                                                                                                           | Why                                                                                   | Alternatives                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| TS workspace                 | pnpm workspaces, plain `pnpm -r`                                                                               | Fewest moving parts                                                                   | Turborepo, Nx later if CI is slow |
| Python                       | uv workspace, ruff, pytest                                                                                     | One tool for env and lock                                                             | Poetry                            |
| TS lint/format               | Biome                                                                                                          | One dependency for both                                                               | ESLint + Prettier                 |
| API                          | Fastify + official rate-limit plugin                                                                           | Built-in schema validation, Redis-backed limits                                       | Hono, Express                     |
| DB access TS                 | `pg` + Kysely                                                                                                  | Typed SQL, no ORM                                                                     | Drizzle, Prisma                   |
| DB access Python             | `psycopg` 3, raw SQL                                                                                           | Few dependencies                                                                      | SQLAlchemy                        |
| Migrations                   | Plain SQL; Supabase CLI if docs confirm fit, else `dbmate`                                                     | Language-neutral                                                                      | Prisma Migrate                    |
| Chain TS                     | `viem`                                                                                                         | Typed ABIs, EIP-712                                                                   | ethers                            |
| Chain Python (`oracle-node`) | `eth-account` for EIP-712 signing, `web3` for submission, versions pinned and checked against Foundry fixtures | Standard libraries; confirm maintenance and EIP-712 support from docs before adopting | Hand-rolled signing (rejected)    |
| Frontend                     | Next.js App Router, CSS Modules + CSS variables                                                                | Fewest dependencies                                                                   | Tailwind                          |
| Charts                       | uPlot for time series; hand-written SVG for spread and heatmap                                                 | Small and fast                                                                        | Recharts, visx, D3                |
| Animation                    | CSS transitions, Web Animations API                                                                            | Cheap, honors `prefers-reduced-motion`                                                | Framer Motion                     |
| Wallet (Phase 3)             | wagmi + viem                                                                                                   | Decided when `/markets` starts                                                        | RainbowKit                        |

Official docs are checked first for Next.js, Vercel, Supabase pooler modes and limits, Railway cron interval and restarts, and Foundry's Blockscout verification. Collectors run as long-lived workers with an internal scheduler unless F9 shows Railway cron suits a 10-minute cadence.

### 5.2 Data flow rules

All writes go through Railway services; the frontend reads only through `api`. Supabase connections use the pooler (mode chosen after F9). RLS on every table, no public policy. Contract addresses, chain ID, RPC and explorer come from per-environment config with a `verified` flag. Token decimals are read from the contract and checked against config at startup; mismatch stops the service.

### 5.3 Initial schema (plain Postgres)

- `gpu_classes`, `sources`, `methodology_versions (version, announced_at, effective_from, spec_hash)`.
- `price_observations` partitioned monthly on `observed_at`: source, class, price `numeric(18,6)`, available GPUs nullable, payload hash, collector version.
- `gri_hourly (index_id, hour, value, valid_sources, status, methodology_version, input_hash)` and `gri_inputs (index_id, hour, source, price, weight, kept)`.
- `index_rollups_hour`, `index_rollups_day`, filled by `index-engine`.
- `social_posts` (post ID, platform, author ref, timestamps, no text), `post_labels` (label, bot score, model hash), `kol_scores`, `cmi_daily`, `cmi_inputs`.
- `oracle_operator_values` (from events), `oracle_reports`, `oracle_rejections`, `report_board`, `markets`, `market_events` (with block hash for reorgs), `indexer_cursor`.
- Prices and money are `numeric` in SQL and `bigint` or `Decimal` in code, never float.

### 5.4 Index math rules

Pure functions: no I/O, no clock, no randomness, no floats. The methodology version selects the weight function and parameters. The package version is part of each report's input hash. `index-engine` and every `oracle-node` run the same package version.

### 5.5 Registry, no proxy (D6)

`OracleRegistry` (multisig + timelock) lists approved oracle and factory versions. Oracle and factory are plain contracts; a new version is a new deployment. Each market pins the oracle address at creation, so nobody can change an open market's settlement source and nothing can rescue it either. Cost: during migration operators publish to both versions; history is not shared across versions (a market needs only its 24h window plus grace). Operator allowlist: add through timelock, remove immediately by multisig.

### 5.6 Tests and CI

- Index math: shared golden vectors in `test-vectors/`, Hypothesis property tests.
- Oracle aggregation: the same vectors drive `forge test` and a Python model; Python-signed EIP-712 fixtures are verified in Foundry.
- Collectors: recorded fixtures and schema checks in PR CI; a scheduled live check outside PR CI.
- Contracts: Foundry unit, fuzz (high runs in CI), invariants; Slither.
- DB: migrations on clean Postgres; query tests against real Postgres.
- Services: integration tests with Postgres and Redis containers.
- CI (GitHub Actions, A2): Biome, `tsc`, ruff, pytest, `forge test`, migrations, secret scan, vector consistency, and a scan of every PR commit for AI attribution (local hooks can be skipped).
- Graphify: run manually at each phase change only; `graphify-out/` is git-ignored.

## 6. Frontend design direction

Not inferable yet: `docs/references/` is empty, so palette, typography, density, chart style, motion patterns and component look are unknown and I will not guess. Revision follows when files arrive.

Supported by the brief alone:

- Pages: `/`, `/gpu/{class}`, `/narratives`, `/markets`, `/methodology`, `/oracle`.
- Components that follow from the content: index tile with 7-day change and staleness badge, price time-series chart, cross-source spread, valid-source counter, methodology version badge, narrative heatmap, market card with implied-odds bar and countdown, per-operator value table with spread, void/stale banner, a plain "v1 limits" notice on `/oracle` and `/methodology`.
- Motion only where it explains data (value change on refresh, chart range transitions, countdown); respect `prefers-reduced-motion`; no decorative loops.
- Rules from the working agreement: no default purple gradient, no unmotivated glassmorphism, no emoji icons, no uniform card grid without hierarchy, no raw copying of reference assets or code.

## 7. Risks and mitigations

| Risk                                                       | Mitigation                                                                                               | Limit                                                                                                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A provider moves its price briefly to shift GRI            | Median, outlier bound with floor, 24h TWAP for settlement                                                | Several coordinated sources can still move a median; TWAP lowers, not removes, the risk. With `w = 1` every source counts equally, so adding sources matters                     |
| Provider terms forbid storing or republishing data         | Terms review (A4), aggregate-only display                                                                | A class may fall under the minimum and go unpublished                                                                                                                            |
| Source API changes or vanishes                             | Schema validation, watchdog, margin above the minimum                                                    | Gaps possible; stale and void rules cover them                                                                                                                                   |
| One operator key leaks or two operators collude            | Allowlist, multisig removal, public inputs and per-operator events, rotation drill                       | v1 is trust-the-team: no stake, no slashing, all three operators are one team; with two surviving values two operators decide the result. Stated on `/oracle` and `/methodology` |
| Python signing or `web3` behaves differently from Solidity | Cross-language fixtures, pinned versions                                                                 | Tests cover known cases only                                                                                                                                                     |
| Operator or relayer offline                                | 2 of 3 quorum, drills, alerts                                                                            | Two offline: stale, then void                                                                                                                                                    |
| Sequencer or chain outage                                  | Stale then void and refund                                                                               | Users cannot act during the outage                                                                                                                                               |
| Contract bug in market or oracle                           | Fuzz and invariant tests, audit, caps, testnet rehearsal                                                 | Audit lowers, does not remove, risk                                                                                                                                              |
| A wrong or manipulated oracle value hits a running market  | Caps; do not open markets on a new oracle version before it has run for a set period (proposal: 14 days) | By decision D6 there is no rescue path; users bear that risk                                                                                                                     |
| Pause abuse                                                | Pause stops only `buy`; `claim` and `refundIfVoid` have no pause path, proven by invariant               | Admin can stop new participation                                                                                                                                                 |
| USDG issuer freezes a balance                              | Disclosed                                                                                                | Outside our control                                                                                                                                                              |
| Provider or operator bets                                  | Disclose operator wallets; monitor known wallets                                                         | Fresh addresses cannot be blocked; cap is a speed bump                                                                                                                           |
| Narrative pumping or bots move CMI                         | Credibility, bot filter, decay, no CMI market in v1                                                      | Not preventable; labelling is not third-party reproducible                                                                                                                       |
| Social API cost, terms or blocking                         | Three platforms, at least 2 needed per day, terms review                                                 | Telegram optional only                                                                                                                                                           |
| Market classed as gambling or derivative                   | Legal review, geoblock, caps, no leverage                                                                | Geoblock covers only our frontend and API; this plan is not legal advice                                                                                                         |
| Thin liquidity                                             | One weekly market first                                                                                  | Small pools give weak odds                                                                                                                                                       |
| Hosting outage                                             | Index recomputable from export; chain data independent of hosting                                        | Dashboard and API down meanwhile                                                                                                                                                 |
| Secret leak                                                | Env only, secret scan, keys with minimal funds                                                           | Railway env vars visible to project members                                                                                                                                      |

## 8. Skills (read in full from `.claude/skills/`)

| Skill      | What it does (per files)                                                                                                                                                        | Use here                                                        | Do not use                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caveman`  | Terse reply style; persists for the session once started; its own text exempts persisted artifacts                                                                              | Chat replies only, when you ask (D12)                           | Any repo file: docs, comments, commits, PR text, UI copy. Not when asking you questions or warning about risk                                                                                                                                        |
| `ponytail` | Coding mode: smallest complete change, reuse first, no dependency for a few lines, small test for non-trivial logic, closing line on what was skipped; levels lite, full, ultra | Implementation tasks and dependency choices at `lite` or `full` | `ultra` may not contest final decisions (D12). Money, oracle and contract code follow your test rules (unit, fuzz, invariant), which are stricter than its "one small test"                                                                          |
| `graphify` | Builds a knowledge graph into `graphify-out/` (AST for code, LLM for docs); installs `graphifyy` on first run; optional commit hook and `CLAUDE.md` section                     | Run manually at each phase change, AST-only first (D12)         | `graphify hook install` (writes `.git/hooks`, bypassed by `core.hooksPath`) is not used. `graphify claude install` edits `CLAUDE.md`: only through diff review. No semantic extraction of docs without your OK. I do not repeat its sponsorship line |

Conflicts found and their resolution (all settled by D12): caveman persistence vs persisted text; ponytail `ultra` vs final decisions; graphify hook and `CLAUDE.md` edits vs `.githooks` and review. No skill asks for AI attribution. `ultracave` and `megacave` are absent; `megacave` writes Classical Chinese and would break the language rules if installed.
