# Progress and plan

State on 2026-11-24. Last pushed commit: 8b0a0e1. Local only: b4625fe (social platform terms in `docs/sources.md`).

## Running now

| Part | Where | State |
| --- | --- | --- |
| `api` | Railway, public domain | Up. `/v1/indexes` returns live data (`isSample: false`). |
| `worker` (collectors, engine, watchdog) | Railway | Up. Providers on: Lambda, Texel, Akash, Salad, Vast.ai, RunPod, Hyperstack. TensorDock off. |
| Database | Supabase, session pooler | Migrations applied through 0005. |
| Web | Vercel | `API_BASE_URL` set. Header wallet connects to a real browser wallet (testnet unless `CHAIN_ENV` says otherwise). Markets page shows sample data until a factory exists. |

GRI at 2026-11-24 07:00 UTC: GRI-4090 and GRI-A100 live with 5 valid sources. GRI-B200, H100, H200 not published (hour 06:00 had 4, 3, 2 valid sources because three providers were switched on at 06:56). Check again after 08:05 UTC: expected H100 6 valid, B200 5 valid, H200 stays at 4 raw sources and cannot publish without a fifth provider.

Vast.ai and RunPod terms bar index use without written agreement. Hyperstack clause 6.4 bars derivative works. Internal testing only; no value from them goes to a real market or a public index.

## Chain configuration

- Testnet 46630, token tUSDG `0x3A37C1D137e02e04E1CC1e4a7dB0B4628C762b4e`, 6 decimals. `faucet()` and `mint()` are open; claim with a wallet-connected page, not the block explorer (it has no wallet connector).
- Mainnet 4663, token USDG (Paxos) `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals, read from the mainnet RPC. The block explorer page was not checked (Cloudflare). The other address once named, `0xe343...491d`, has no code on this chain.
- Paxos testnet USDG at `0x7E95...802F` exists but is permissioned (no public faucet). Not used.
- Contracts target EVM `shanghai`. Proven on testnet (the token uses `PUSH0`); mainnet not checked.

## Testnet deploy (not done)

Script: `contracts/script/DeployTestnet.s.sol`. Simulated against the testnet fork with the real addresses in `.env`; about 0.000145 ETH. Nothing has been sent to a chain.

Wallets (public addresses in `.env`, section "Wallets: testnet deploy"):

- Deployer: key in a forge keystore (`cast wallet import`). Needs about 0.001 ETH.
- ADMIN `0x21BE...63C0`: receives oracle admin, guardian and factory owner at the end of the script. One EOA stands in for the multisig on testnet.
- Operators 1 to 3: sign only, no gas.
- Keeper and relayer: need gas (about 0.001 ETH each). Keeper is registered by the script. Relayer key goes to Railway as `RELAYER_PRIVATE_KEY`.
- Buyback, treasury: receive only.
- Test user `0x9869...E903`: 10,000 tUSDG, about 0.01 ETH.

Before deploying:

1. Fund deployer, keeper and relayer from https://faucet.testnet.chain.robinhood.com/.
2. Decide `FEE_OPERATORS`. It currently equals operator 1, so the 20% share goes to one operator. `FeeRouter` is immutable.
3. Code freeze and tag (ROADMAP 6.2). A contract change after deploy means a new deployment.
4. Owner runs the script (`forge script ... --account <keystore> --broadcast`); the transfer to ADMIN has no acceptance step, so check the ADMIN address twice.

After deploy: set `CHAIN_ENV`, `RPC_URL`, `FACTORY_ADDRESS` on Vercel and Railway; deploy indexer, market-keeper and relayer on Railway; operator-node waits for approval of the `eth-account` dependency; create a test market.

## Mainnet admin (later)

Admin must be a multisig plus a timelock. Plan: three EOA signers on different devices or people (hardware wallets advised), Safe with threshold 2 of 3, then a timelock contract owned by the Safe. The timelock contract is not in the repo yet and needs approval. Check that Safe supports Robinhood Chain in the Safe app before relying on it. A mainnet deploy script needs two roles (timelock as admin, Safe as guardian) and none of the testnet shortcuts. Check `PUSH0` support on mainnet.

## Stage 4: CMI

Done: 4.2 terms and costs are in `docs/sources.md` ("Social platforms (CMI)"), with live read-only tests on 2026-11-25: Farcaster through Neynar Free works (10 credits per cast returned), Bluesky works with an app-password session, X returns 402 until credits exist. 4.1 spec `docs/methodology/cmi-v1.0.md` and 4.5 pure functions in `siliqua-index` with golden vectors `test-vectors/cmi-v1.0.json` (commit `b08a7c8`).

Decision 2026-11-25: build CMI without X. X stays a separate collector, off by configuration (`X_BEARER_TOKEN` is not set on Railway) until credits exist. With X off, both Farcaster and Bluesky must return data for a day to publish (2 of 3 rule).

Owner decisions open:

1. Narrative list, keyword list and account (KOL) list; one or two people to label the 500 posts (A10); target precision and recall; entry threshold for OTHER. These block the collectors' queries and the classifier.
2. Proposed credibility parameters in the spec (age floor 10%, cap 365 days, listed account x2).
3. Neynar commercial use and derived data: ask Neynar Support (terms page unreadable).
4. Bluesky: storage of posts, labels and scores is not addressed by the terms.
5. Whether post text may be stored for classifier work.
6. Telegram: recommended off in v1.
7. X: monthly budget and index-derivative status, only if X is enabled later.

Decision 2026-11-25: keep only the posts inside the 7-day lookback plus one day (delete older), to stay inside the Supabase size limit. Per-post labels are therefore not auditable after 8 days; daily values stay in `cmi_daily`.

Built: `workers/social-collectors` (Farcaster and Bluesky readers, keyword classifier, scoring, store, worker with `--once`), tables in migration 0006. Tested end to end against the local database on 2026-11-25 with a 50-cast budget. Not deployed: no Railway service exists for it yet. To run it: `COLLECTOR_FARCASTER_ENABLED`, `COLLECTOR_BLUESKY_ENABLED`, `NEYNAR_API_KEY`, `BSKY_HANDLE`, `BSKY_APP_PASSWORD`, optional `FARCASTER_DAILY_CAST_BUDGET` (default 20,000 casts per day) and `CMI_ENTRY_THRESHOLD_BPS`.

Next: the daily CMI job in `index-engine` (reads `social_posts` and `social_platform_days`, writes `cmi_daily`), then a Railway service for the collector.

## Other open items

- Push of `b4625fe`.
- Railway auto-deploy on push is on for both services; disabling is UI only.
- Supabase: confirm the Data API is disabled.
- Railway Trial credit (5 USD or 30 days, one time) is being used by two always-on services.
- Vast.ai and RunPod API keys were printed in a chat transcript by mistake on 2026-11-24; rotate both and update `.env` and the Railway worker variables.
- Market threshold policy (default: latest finalized oracle value) awaits owner confirmation.
- Empty-pool rules wait for owner confirmation (plan Q-N2).
