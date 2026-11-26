# Siliqua - Roadmap

Order requested by the owner: frontend, backend, smart contracts, then the rest. This file sequences `docs/PLAN.md`; it does not change any decision there. Where they conflict, `CLAUDE.md` wins, then `PLAN.md`.

Legend: **[H]** needs human input. **[owner]** written by the owner, help only on request. Gate = condition that must hold before the next stage counts as done.

## Reading the order

The design reference is a static prototype (`docs/references/Siliqua · The coin of compute.html`, hash router, hard-coded data). Frontend can therefore start now against mock fixtures. Two things still run from day one, in parallel with the frontend, because they have wall-clock cost (PLAN D13):

- Price collectors (PLAN 0.1, 0.2). The 30-day gate starts only when at least 5 sources are live.
- Foundation items F1-F3, F4a, F6a, F8.

So the real shape is: Foundation, then Frontend and Collectors side by side, then Backend completion, Oracle, CMI, Market, one Testnet release, Launch.

Owner decision 2026-11-24, which changes only the sequencing of PLAN D13: finish and test the whole system on a local chain first (Foundry and anvil), then deploy once to testnet, then go to mainnet after the owner approves the testnet results. Nothing is deployed to a public chain before Stage 6. The wall-clock gates that need a public chain (14 days of oracle reports, 3 weekly market cycles) therefore start at Stage 6 and run in parallel. Consequence: contracts are frozen before the testnet deploy. Contracts are immutable and not proxied, so a change after the freeze means a new deployment and a restart of the gates.

## Stage 0 - Foundation (minimum)

| #   | Task                                                                                       | Depends on |
| --- | ------------------------------------------------------------------------------------------ | ---------- |
| 0.1 | `git init`, `.gitignore`, `.gitattributes`, `.githooks/commit-msg`, `core.hooksPath`        | [H] A2     |
| 0.2 | pnpm workspace + Biome + `tsc`; uv workspace + ruff + pytest; Foundry project              | 0.1        |
| 0.3 | Typed env loader per service, `.env.example`                                               | 0.2        |
| 0.4 | CI: lint, types, tests, secret scan, AI-attribution scan of PR commits                     | 0.2        |
| 0.5 | Vercel, Supabase, Railway projects                                                         | [H] F10    |

Gate: clean clone runs `pnpm install && uv sync && forge build && forge test` green locally and in CI; hook rejects AI attribution.

## Stage 1 - Frontend (`apps/web`)

Goal: every page in the prototype exists in Next.js, reads only through a typed API client, and runs on mock fixtures until Stage 2 ships `api`.

Pages from the prototype routes: `/`, `/gpu/[class]` (h100, h200, b200, a100, 4090), `/narratives`, `/markets`, `/markets/[id]` (prototype: `market-sample`), `/methodology`, `/oracle`, `/data`, `/privacy`, `/terms`. The prototype `design` route is a design-system page: keep it as an internal route, not public.

| #   | Task                                                                                                                                                                                  | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1.1 | Check current Next.js and Vercel docs; scaffold App Router; CSS Modules with tokens from the prototype (`--bg #0A0A0B`, `--tx`, `--dim`, `--ln`, `--em`, `--up`, `--dn`, `--hd` Archivo, `--mo` JetBrains Mono, `--pad`) | 0.2        |
| 1.2 | Fonts through `next/font` (not the Google Fonts `<link>` in the prototype)                                                                                                            | 1.1        |
| 1.3 | Layout: nav, footer, wallet drawer shell, toast, hash routes mapped to real paths with redirects                                                                                      | 1.1        |
| 1.4 | API contract: write response types and mock fixtures from PLAN B8 (`/v1/index`, `/history`, `/sources`, `/methodology`); every response carries `methodologyVersion`                    | 1.1        |
| 1.5 | Core components: index tile (7-day change, staleness badge), valid-source counter, methodology version badge, status states (LIVE, STALE, INSUFFICIENT SOURCES)                        | 1.3, 1.4   |
| 1.6 | Charts: uPlot for time series; hand-written SVG for source spread and narrative heatmap                                                                                               | 1.5        |
| 1.7 | Pages `/`, `/gpu/[class]`, `/methodology`, `/data`, `/privacy`, `/terms`                                                                                                              | 1.5, 1.6   |
| 1.8 | Pages `/narratives`, `/oracle` (per-operator values, spread, rejected reports, plain v1 limits notice), `/markets`, `/markets/[id]` on mock data, no wallet logic                      | 1.5, 1.6   |
| 1.9 | Motion pass: only motion that explains data (value change, range change, countdown); `prefers-reduced-motion` honored everywhere; hero visual per decision below                     | 1.7        |
| 1.10 | Accessibility, responsive check (320 px up), Lighthouse budget, metadata per route                                                                                                    | 1.8        |

Rules for this stage:

- Prototype numbers are fake. Mock data is labelled as sample data in the UI until real data replaces it. Never show a mock value as live.
- No emoji icons, no uniform card grid without hierarchy, no copying prototype code verbatim: rebuild components.
- Prototype loads Three.js r128 from a CDN for the hero coin. A new library needs owner approval, and PLAN 5.1 picks CSS and Web Animations. Decision **[H]**: approve `three` (lazy-loaded, WebGL fallback, off under reduced motion) or replace with SVG/CSS. Default until answered: SVG/CSS, no `three`.
- Wallet connect and buy/claim/refund stay out until Stage 5 (wagmi + viem decided then).

Gate: all pages render from fixtures at desktop and 320 px; reduced-motion check passes; no page references a service that does not exist; owner signs off the visual match against the reference.

## Stage 2 - Backend: data and API

Goal: trustworthy public GRI off-chain. Collectors are already running from Stage 0 and are not repeated here.

| #   | Task                                                                                                                                                                        | Depends on          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 2.1 | Provider survey into `docs/sources.md` (API, auth, limits, price semantics, terms on store and republish)                                                                   | [H] A4              |
| 2.2 | `workers/price-collectors`: one module per provider, 10-minute cadence, schema validation, payload hash, recorded fixtures                                                  | 2.1, [H] keys       |
| 2.3 | Migrations: baseline schema (PLAN 5.3), monthly partitions for `price_observations`, RLS on every table with no public policy                                               | 0.2                 |
| 2.4 | `workers/watchdog` minimum: coverage gaps per class, source freshness, alert                                                                                                | 2.2, [H] alert target |
| 2.5 | `docs/methodology/gri-v1.0.md`: SKU table, outlier bound `3 * max(1.4826 * MAD, 1% of median)`, `w = 1`, minimum 5 sources, TWAP and stale rules                            | 2.1                 |
| 2.6 | `packages/siliqua-index`: pure `gri()` and `twap()`, integers or `Decimal`, golden vectors in `test-vectors/`, property tests                                                | 2.5                 |
| 2.7 | `workers/index-engine`: hourly GRI with backfill, rollups, classes under the minimum not published                                                                          | 2.2, 2.6            |
| 2.8 | `services/api` (Fastify): `/v1/index`, `/history`, `/sources`, `/methodology`; Redis cache and 60 req/min per IP limit                                                      | 2.7                 |
| 2.9 | Swap frontend mock fixtures for the real client; remove sample-data labels page by page                                                                                     | 1.8, 2.8            |
| 2.10 | Monthly raw export with SHA-256 manifest and a `verify` script that recomputes any hour                                                                                    | 2.7                 |

Gate: at least 5 sources live per qualifying class; 30 days with no raw-coverage gap over 6h; backfilled values equal live; `verify` reproduces 100% of sampled hours; `/`, `/gpu/*`, `/methodology` show live data.

## Stage 3 - Smart contracts, part 1: oracle

Interfaces first, so the oracle-node, indexer and `/oracle` page can be built against a fixed ABI. Everything runs against a local chain; the public testnet deploy is Stage 6.

| #   | Task                                                                                                                                         | Depends on         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 3.1 | Oracle spec: EIP-712 struct, median and outlier drop with worked examples, slot and late-report rules, nonce bitmap, allowlist, registry      | 2.5                |
| 3.2 | `SiliquaOracle` + registry with unit, fuzz, invariant tests; shared JSON vectors **[owner]**                                                  | 3.1                |
| 3.3 | `services/oracle-node` (Python): snapshot, `siliqua-index`, EIP-712 sign, post to report board; cross-language fixtures verified in Foundry   | 3.1, 2.7           |
| 3.4 | Report board endpoint in `api` and batch relayer; alert if a slot is not finalized                                                           | 3.1                |
| 3.5 | `services/indexer`: events to Postgres, reorg handling (tested with anvil reorgs), per-operator values                                       | 3.2                |
| 3.6 | Local end-to-end: three oracle-node instances with separate keys report to a local chain; `/oracle` page on that data                         | 3.3-3.5, 1.8       |
| 3.7 | Read-only example consumer and docs                                                                                                          | 3.2, [H] A12       |

Gate (local chain): replay, duplicate, wrong-signer, late and outlier cases tested and visible; max pairwise operator spread under 0.5% per slot from events in the local run; one operator-offline drill and one key-rotation drill pass. The 14-day public run is in Stage 6.

## Stage 4 - CMI

| #   | Task                                                                                                                                | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 4.1 | CMI v1 spec and published keyword list                                                                                              | -          |
| 4.2 | Platform terms and costs (X, Farcaster, Bluesky, Telegram optional) into `docs/sources.md`; report cost to owner before building    | [H] A9     |
| 4.3 | `workers/social-collectors` and bot filter; store IDs, labels, scores, model hash, never post text                                   | 4.2        |
| 4.4 | Credibility scoring, frozen and versioned classifier                                                                                | 4.1        |
| 4.5 | CMI in `siliqua-index` with vectors and property tests; daily job in `index-engine`                                                  | 4.1        |
| 4.6 | 500-post manual test with precision and recall per narrative                                                                         | [H] A10    |
| 4.7 | CMI through the oracle path on the local chain; `/narratives` on that data (live data in Stage 6)                                     | Stage 3    |

Gate: methodology and test report published; at least 7 days of daily CMI with per-platform health visible.

## Stage 5 - Smart contracts, part 2: market

Money enters here. Nothing in this stage touches a public chain; Stage 6 is the first deploy and Stage 7 is the first mainnet deploy.

| #   | Task                                                                                                                                              | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 5.1 | Market spec: timeline, `settle` after `settleTime + 3h`, void rule, tie and empty-pool rules (PLAN Q-N2 confirmed)                                  | Stage 3    |
| 5.2 | `MarketFactory`, `RangeMarket`, `FeeRouter` with unit, fuzz, invariant tests **[owner]**                                                           | 5.1        |
| 5.3 | `services/market-keeper`: create, settle, sweep fees, alert on missed deadlines                                                                    | 5.2        |
| 5.4 | Indexer and API for markets (`/v1/markets`, implied odds)                                                                                          | 5.2        |
| 5.5 | Frontend `/markets`: wagmi + viem, buy, claim, refund, countdowns, void banner; geoblock on frontend and API                                       | 5.4, 2.9   |
| 5.6 | $SILQ address and `FeeRouter` recipients into configuration                                                                                        | [H]        |
| 5.7 | Local rehearsal with anvil time warp: at least 3 weekly cycles including forced void, tie, empty pools                                            | 5.3-5.5    |

Gate: local rehearsal log shows every branch end to end; invariants hold: claims plus refunds never exceed balance, `claim` and `refundIfVoid` never blocked by pause.

## Stage 6 - Testnet release (single deploy)

First public-chain deploy. Oracle, `MarketFactory`, `RangeMarket` and `FeeRouter` go out together after a code freeze. One Railway set and one database, with the chain data replaced at mainnet cutover.

| #   | Task                                                                                                                           | Depends on           |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 6.1 | Chain facts checked against official docs: chain ID, USDG address and `decimals()`, RPC, Blockscout; `verified` flag set        | [H] A7               |
| 6.2 | Code freeze and tag; deploy all contracts to testnet; verify on Blockscout; three operator Railway projects with separate keys  | 6.1, Stage 5, [H] A8 |
| 6.3 | `indexer`, `market-keeper` and `api` against testnet; `/oracle`, `/narratives`, `/markets` on live testnet data                 | 6.2                  |
| 6.4 | Oracle run: 14 days of reports, plus one operator-offline drill and one key-rotation drill on testnet                           | 6.2                  |
| 6.5 | Market run: at least 3 weekly cycles, including forced void, tie and empty pools, created by `market-keeper`                    | 6.2, 6.3             |
| 6.6 | Owner review of the run logs and sign-off recorded in the repo                                                                  | 6.4, 6.5             |

Gate: 6.4 and 6.5 finish with no unexplained divergence; max pairwise operator spread under 0.5% per slot from testnet events; invariants hold on testnet (claims plus refunds never exceed balance, `claim` and `refundIfVoid` never blocked by pause); owner sign-off recorded. Stage 2's 30-day data gate must also be closed before Stage 7.

## Stage 7 - Launch readiness and mainnet

| #   | Task                                                                                                                                                  | Depends on                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 7.1 | Legal review and geoblock scope                                                                                                                       | [H] A11                             |
| 7.2 | Contract audit of the frozen code; findings fixed or accepted in writing. A fix means a new deployment and a Stage 6 rerun                            | [H] A11, Stage 6                    |
| 7.3 | Go/No-Go checklist from the brief plus caps active, multisig and timelock, pause drill                                                                | 7.1, 7.2                            |
| 7.4 | Mainnet deploy of oracle and market contracts with multisig and timelock; operator addresses published; first market capped; monitoring and runbooks | 7.3, Stage 2 gate, Stage 6 sign-off |

Independent review of the oracle before mainnet is recommended (PLAN Phase 1 risks). Schedule the audit on the frozen code before or during Stage 6 so its findings do not arrive after the testnet run.

## Open items blocking this roadmap

1. A2: confirm `git init`, GitHub, `core.hooksPath`. Blocks Stage 0.
2. Three.js approval for the hero (Stage 1.9).
3. A4: GPU provider accounts, keys and terms review. Blocks collectors, so it sets the real start date.
4. A7: chain facts checked against official docs. Blocks Stage 6 testnet.
5. A9, A10, A11: social cost approval, labelers, legal and audit budget.

## Graphify

Run manually at each stage change, AST-only first. Never `graphify hook install`.
