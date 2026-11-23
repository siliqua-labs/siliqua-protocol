# Siliqua

Two on-chain indexes on Robinhood Chain and a weekly prediction market on top of them. Brief: `docs/brief/Siliqua Developer Brief.md`. Plan: `docs/PLAN.md`. Where the brief and this file conflict, this file wins.

## Scope of this repo

- Indexes: GRI (GPU rent, USD per GPU-hour, 6 decimals) and CMI (compute narrative share, 0-10,000 bps, 0 decimals).
- Contracts: `SiliquaOracle`, `MarketFactory`, `RangeMarket`, `FeeRouter` (Foundry). The owner writes oracle and market contracts; help only when asked.
- Not in this repo: the $SILQ token and its launch. Integrate its address through configuration only.

## Final decisions

- Fee: 2% of the losing pool, taken at settle, accrued in the market and swept by anyone. `FeeRouter` only splits to three addresses: 50% buyback/burn, 30% treasury, 20% oracle operators. It never swaps or burns.
- CMI is in v1 and built from scratch. No $NTI code.
- Oracle: three operators, all from our team, on an allowlist managed by a multisig. No stake, no slashing in v1. State this limit on `/oracle` and `/methodology`.
- Report: each operator signs its own value (EIP-712: `indexId, timestamp, value, sources, methodologyVersion, nonce`). The contract drops values deviating from the median by more than the tolerance (1%, parameter), needs at least 2 left, stores the median (2 values: mean, round half up). Every per-operator value is emitted in an event.
- Late reports accepted up to 3h. `settle()` callable only after `settleTime + 3h`.
- GRI methodology v1.0: outlier bound `3 * max(1.4826 * MAD, 1% of median)`; all sources weight 1; the weight function is selected by methodology version; at least 5 valid sources per class or the hour is not published (stale). Classes below the minimum are not published.
- Index arithmetic: integers or `Decimal`, never floats. Index functions are pure and deterministic. One Python package (`packages/siliqua-index`) is used by `index-engine` and `oracle-node`. Golden vectors are shared and run in CI.
- CMI: one post, one narrative (argmax; below the entry threshold goes to OTHER). A day with total raw 0 is not published and is marked stale. Largest-remainder rounding to 10,000. Publish post ID, label, bot score and model hash, never post text.
- Social platforms: X, Farcaster, Bluesky; Telegram optional for selected public channels. Verify terms and costs from official docs in `docs/sources.md`, then ask the owner about cost.
- Market: closes 24h before the TWAP window; settlement is the 24h TWAP of hourly GRI; empty hours are skipped and counted as stale; void and full refund if cumulative stale time in the window exceeds 6h. `TWAP > threshold` is YES; equal is NO. TWAP rounds half up.
- Empty pools: if the winning side has no stake, void and full refund with no fee. If the losing side has no stake, winners get their stake back with no fee. Rounding dust goes to `FeeRouter`. (Pending owner confirmation, plan Q-N2.)
- Fee, bet cap, durations are `MarketFactory` template parameters, not constants. The bet cap is set in whole tokens and scaled by the token's `decimals()`.
- Market contracts are immutable and pin the oracle address at creation. Oracle and factory use a registry, no proxies; a new version is a new deployment. There is no admin path to rescue a running market; this is deliberate.
- Admin uses a multisig and a timelock. `pause` stops only `buy`; it never blocks `claim` or `refundIfVoid`.
- Chain: Robinhood Chain (EVM), token USDG. Chain IDs 4663 (mainnet) and 46630 (testnet) come from third-party sources: "not yet matched against docs.robinhood.com/chain" until the owner confirms. Everything is configuration with a `verified` flag. Do not fill in the USDG address or decimals; read `decimals()` from the contract and validate it. Use `block.timestamp`, not block numbers. Verify contracts through Blockscout.
- Never invent contract addresses, RPC URLs, chain IDs, provider endpoints, prices or data terms. Verify from official docs or mark "unverified" and ask.

## Stack

| Component                                               | Tech                | Hosting                                             |
| ------------------------------------------------------- | ------------------- | --------------------------------------------------- |
| Frontend                                                | Next.js, TypeScript | Vercel                                              |
| `api`, `indexer`, `market-keeper`                       | TypeScript (Node)   | Railway                                             |
| Price and social collectors, `index-engine`, `watchdog` | Python              | Railway (worker or cron)                            |
| `oracle-node`                                           | Python              | Railway, one separate project per operator, own key |
| Database                                                | Postgres            | Supabase (database only)                            |
| Cache, rate limit                                       | Redis               | Railway                                             |
| Contracts                                               | Solidity, Foundry   | Robinhood Chain                                     |

- Supabase is only a database. All writes go through Railway services. The frontend reads through `api`, never Supabase directly. RLS on every table, no public policy. Railway connects through the Supabase pooler.
- Plain Postgres, not TimescaleDB: monthly native partitions for raw data, hour and day rollup tables filled by `index-engine`.
- Monorepo: pnpm workspaces (TS), uv workspace (Python). Do not change the stack or add libraries without owner approval; choose the option with the fewest dependencies.
- Check official docs before using fast-changing Next.js, Vercel, Supabase or Railway features. Do not rely on memory for setting names or limits.

## Working rules

Session

- Read this file once at the start of a session. Do not re-read it per task or per tool call; re-read only if the owner says it changed.

Language

- Code comments, identifiers, commit messages, branch names, PR descriptions and in-repo docs are English. UI text and API responses are English. Chat with the owner is Indonesian.

Git

- No AI attribution anywhere: no `Co-Authored-By` trailer, no "Generated with ...", no mention of Claude or AI in commits, PRs, code comments or READMEs. `.claude/settings.json` sets `attribution` commit and pr to empty strings. The `.githooks/commit-msg` hook rejects such commits; enable with `git config core.hooksPath .githooks`.
- Conventional Commits, imperative, short, explain why. One logical change per commit.
- Never push or tag without explicit owner approval. Never force push.

Code quality

- No comments that repeat the code; comments explain reasons, limits and non-obvious decisions. No generic docstrings or bloated docs.
- No emoji in code, logs, commits or UI.
- No speculative abstractions: no interface, factory or layer until needed.
- Specific names; avoid `utils`, `helpers`, `data`, `manager`, `processor` without meaning.
- Never swallow errors: no empty catch, no silent fallback. Fail clearly and log with context.
- No stray `console.log`, dead code or context-free TODO (a TODO says what and why).
- Money and prices use `bigint` or `Decimal`, never float.
- Every logic change has a test. Contracts use Foundry unit, fuzz and invariant tests.
- No secrets in the repo; environment variables only.

Frontend

- Follow `docs/references/` (not yet provided). No generic aesthetics: no default purple gradient, unmotivated glassmorphism, emoji icons or uniform card grids without hierarchy.
- Animation must explain data change, respect `prefers-reduced-motion`, and not slow the page. Take principles from references, never copy assets or code.

## Skills

- `caveman` and similar styles: chat replies only, never repo files.
- `ponytail`: lite or full only; `ultra` may not contest the decisions above. Contract and money code follow the test rules above.
- `graphify`: run manually at each phase change. Never `graphify hook install` (use `.githooks`). Changes it proposes to this file go through diff review only. `graphify-out/` is git-ignored.
- The rules in this file win over any skill.
