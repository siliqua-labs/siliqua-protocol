# Testnet deploy runbook

Robinhood Chain testnet (46630). One EOA (`ADMIN`) stands in for the multisig and timelock; mainnet needs the real ones (`docs/progres.md`, "Mainnet admin"). Nothing here sends a transaction until the owner runs step 3.

## 0. Before anything

1. Decide `FEE_OPERATORS`. `FeeRouter` is immutable. It is currently the operator 1 address, so the 20% operator share goes to one wallet.
2. Code freeze: a contract change after the deploy means a new deployment.
3. Fund from https://faucet.testnet.chain.robinhood.com/: the deployer, the keeper and the relayer need gas (about 0.001 ETH each; the script itself needs about 0.00017 ETH). Operators sign only and need no gas.

## 1. Check `.env`

`ADMIN`, `TOKEN`, `OPERATOR_1..3`, `KEEPER`, `FEE_BUYBACK`, `FEE_TREASURY`, `FEE_OPERATORS` are set. `ADMIN` must not be the deploying wallet, and it receives oracle admin, guardian and factory owner in one step with no acceptance, so read the address twice.

## 2. Simulate

From `contracts/`, with the variables above exported (`forge` reads `.env` only from its own directory):

```
forge script script/DeployTestnet.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --account deployer --sender <deployer address>
```

`--sender` must be the address of the keystore account: the script reads `msg.sender` as the deployer, and without the flag forge fails with a `msg.sender` error. On Windows PowerShell, put the Foundry `bin` folder (`%USERPROFILE%\.foundry\bin`) on PATH first. Expect the three contract addresses and no revert.

## 3. Deploy

Same command with `--broadcast` added. Keep the three printed addresses. The script registers the three operators, the five GRI indexes (`GRI-4090`, `-A100`, `-B200`, `-H100`, `-H200`, hourly, 6 decimals, 5 sources, 1% tolerance), one `FeeRouter`, one `MarketFactory` with the template (fee 2%, cap 1,000 tokens, 24h close, 24h TWAP, 6h stale limit), and registers the keeper.

Blockscout verification: `--verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/`. The `/api/` path is the Blockscout convention and has not been matched against the chain docs.

## 4. Railway: api

Add to the `api` service: `CHAIN_ENV=testnet`, `CHAIN_ID=46630`, `RPC_URL`, `ORACLE_ADDRESS`, `FACTORY_ADDRESS`, `ORACLE_OPERATORS=<the three operator addresses, comma separated>`, `ORACLE_TOLERANCE_BPS=100`. The report board and `/v1/oracle` turn on once all three of `CHAIN_ID`, `ORACLE_ADDRESS` and `ORACLE_OPERATORS` are set.

Vercel: `CHAIN_ENV`, `RPC_URL`, `FACTORY_ADDRESS` (markets stop showing sample data when all three are set).

## 5. Railway: chain services

**Small plan (current choice): inside `api`.** `deploy/api.sh` starts the indexer and relayer beside the api when `RUN_INDEXER=true` and `RUN_RELAYER=true`, each restarted on its own if it stops. Set on the `api` service: `RUN_INDEXER`, `RUN_RELAYER`, `INDEXER_START_BLOCK` (the deploy block), `RELAYER_PRIVATE_KEY`; `DATABASE_URL`, `RPC_URL`, `CHAIN_ID`, `ORACLE_ADDRESS`, `FACTORY_ADDRESS` and `ORACLE_OPERATORS` are already there from step 4. The market-keeper still needs its own service (below), or the same trick later.

**Roomier plan: separate services.** Same project as `api`. Each is one service with `RAILWAY_DOCKERFILE_PATH=deploy/Dockerfile.chain` and a `SERVICE` value:

| `SERVICE` | Variables |
| --- | --- |
| `relayer` | `DATABASE_URL`, `RPC_URL`, `CHAIN_ID`, `ORACLE_ADDRESS`, `ORACLE_OPERATORS`, `RELAYER_PRIVATE_KEY` |
| `indexer` | `DATABASE_URL`, `RPC_URL`, `CHAIN_ID`, `ORACLE_ADDRESS`, `FACTORY_ADDRESS`; optional `INDEXER_START_BLOCK` (set it to the deploy block) |
| `market-keeper` | `RPC_URL`, `CHAIN_ID`, `ORACLE_ADDRESS`, `FACTORY_ADDRESS`, `KEEPER_PRIVATE_KEY`, `MARKET_INDEX_ID`, `MARKET_CLOSE_ANCHOR` |

`MARKET_INDEX_ID` is `keccak256` of the label, for example `cast keccak GRI-H100`. `MARKET_CLOSE_ANCHOR` is the unix time of one weekly close; later closes are this plus whole weeks. The relayer and keeper keys are the only secrets here; use wallets that hold nothing else.

## 6. Railway: operators

A separate Railway project from `api` and `worker`, so signing keys never sit next to `DATABASE_URL`. Three services from `deploy/Dockerfile.oracle-node` (`RAILWAY_DOCKERFILE_PATH=deploy/Dockerfile.oracle-node`), one per operator, each with its own variables:

`SIGNING_KEY` (the private key of that operator address), `API_URL`, `CHAIN_ID=46630`, `ORACLE_ADDRESS`, `ORACLE_INDEX_SLUGS` (slugs the oracle registered and the api publishes, for example `h100,a100`; B200 and H200 only once they publish). At start the node logs `operator 0x...`: it must equal that operator's address on the allowlist.

## 7. Check

- `GET <api>/v1/oracle` is 200, not 503.
- After the next hour closes and the engine prints it, each node logs `slot ... accepted`, and `GET <api>/v1/reports?indexId=...&timestamp=...` lists three reports.
- The relayer submits them; `/oracle` shows per-operator values and a finalized value.
- `/operator` with an operator wallet shows that wallet's reports.

## Limits to remember

- Three operators on one team and one infrastructure: no independence claim. Stated on `/oracle`.
- Vast.ai, RunPod and Hyperstack inputs are internal testing only until written agreements exist.
- `oracle-node` has no HTTP health endpoint; watch its logs.
- A node only reports the latest published hour. A missed hour cannot be caught up from the api.
