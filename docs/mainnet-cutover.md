# Mainnet cutover checklist

What changes when the same deployment moves from the testnet (46630) to Robinhood Chain mainnet (4663). Contract addresses are not looked up anywhere: they are the output of the mainnet deploy. Nothing here has been run. Steps that need the owner are marked.

## 1. Before the deploy

- Pass the gates on the roadmap: legal review and contract audit (`docs/ROADMAP.md`).
- Create the Safe (2 of 3) on 4663.
- Deploy the timelock: an OpenZeppelin `TimelockController` with the Safe as proposer and executor, a delay the owner chooses, and no role left on the deploying wallet. It is not in the repo and adding it needs approval.
- Match the mainnet USDG address and the explorer URL against `docs.robinhood.com/chain`. `packages/chain` already marks them verified, from the contracts page and the mainnet RPC; the owner confirms that once more before the deploy (CLAUDE.md, chain decisions).
- Fresh keys for the three operators, the relayer and the keeper. Do not reuse testnet keys.
- Decide `FEE_BUYBACK`, `FEE_TREASURY` and `FEE_OPERATORS`. `FeeRouter` is immutable.

## 2. Deploy

Set these in `contracts/.env` or export them. All are public addresses except the cap; no key goes into a file.

| Variable | Value |
| --- | --- |
| `MAINNET_TOKEN` | USDG, matched against the chain docs |
| `MAINNET_SAFE` | the 2 of 3 Safe; guardian |
| `MAINNET_TIMELOCK` | oracle admin, factory owner, registry admin |
| `MAINNET_OPERATOR_1` to `_3` | new operator addresses |
| `MAINNET_KEEPER` | new keeper address |
| `MAINNET_FEE_BUYBACK`, `_TREASURY`, `_OPERATORS` | permanent for this router |
| `MAINNET_BET_CAP_TOKENS` | whole tokens; start small. Raising it later goes through the timelock |

Simulate from `contracts/`, with the deployer key in a forge keystore:

```
forge script script/DeployMainnet.s.sol --rpc-url <mainnet RPC> --account <keystore> --sender <deployer address>
```

Read the printed addresses, token decimals, bet cap and timelock delay. Then run the same command with `--broadcast --slow`. A local rehearsal estimated about 7.6 million gas for the whole run.

The script deploys `OracleRegistry`, `SiliquaOracle`, `FeeRouter` and `MarketFactory`, registers the three operators, the five GRI indexes (hourly, 6 decimals, 5 sources, 1% tolerance), the keeper and both registry entries, and leaves the deployer with no role. It does not register CMI. If it stops part way, do not use the contracts already sent: run it again.

The four addresses, the deploy blocks and the transaction hashes go into the MAINNET section of `contracts/announcement.md`. They are also in `contracts/broadcast/`.

## 3. Verify source

Do all four contracts, then the first market, on Sourcify. Blockscout failed on contracts with immutables during the testnet deploy, so do not rely on it alone. The constructor arguments of a market are read from its public immutables. The testnet commands are in the git history of `contracts/announcement.md`.

## 4. Variables

| Where | Variable | Mainnet value |
| --- | --- | --- |
| Vercel | `CHAIN_ENV` | `mainnet` |
| Vercel | `RPC_URL` | mainnet RPC from the chain docs |
| Vercel | `FACTORY_ADDRESS` | from step 2 |
| Vercel | `API_BASE_URL` | unchanged if the same `api` serves mainnet |
| Railway `api` | `CHAIN_ENV`, `CHAIN_ID=4663`, `RPC_URL` | mainnet values |
| Railway `api` | `ORACLE_ADDRESS`, `FACTORY_ADDRESS` | from step 2 |
| Railway `api` | `ORACLE_OPERATORS` | the three new operator addresses |
| Railway `api` | `INDEXER_START_BLOCK` | the mainnet oracle deploy block |
| Railway `api` | `RELAYER_PRIVATE_KEY`, `KEEPER_PRIVATE_KEY` | new keys, funded with a little ETH for gas |
| Railway `api` | `MARKET_INDEX_IDS`, `MARKET_CLOSE_ANCHOR` | review the anchor for the first mainnet week |
| Each operator service | `CHAIN_ID=4663`, `ORACLE_ADDRESS`, `SIGNING_KEY` | new values; the node logs its address at start and it must match the allowlist |

The oracle address on the web is read from the factory, so there is no `ORACLE_ADDRESS` on Vercel.

## 5. Data

Chain data (markets, oracle events, reports) is replaced at the cutover; index and price history is kept (`memory: testnet-mainnet-single-deployment`). Clear the chain tables before the indexer starts on the new chain, or it will mix testnet rows with mainnet rows. Set `INDEXER_START_BLOCK` first.

## 6. What changes by itself

- The strip above the header disappears. Its mainnet wording waits for legal review (`lib/siteStrip.ts`).
- "Get free test tUSDG" in the ticket disappears (`testFaucet` is true only on testnet).
- The token becomes the mainnet USDG; decimals are read from the contract and checked.
- The contract table shows the new addresses with their verification status.

## 7. After

- Update the testnet wording on `/docs`, `/whitepaper` and `/faq` (chain, token, faucet, audit status).
- Update the admin key sentence on `/oracle` once the multisig manages the operator allowlist, and the buyback wallet sentence on the market page once a multisig holds that wallet.
- `GET <api>/v1/oracle` is 200; each node logs an accepted slot; `/oracle` shows a finalized value.
- Create one market with a small cap first; buy, wait for settlement, claim.
- Update `contracts/announcement.md` with the verification status of every contract.
- State the v1 trust limits on `/oracle` and `/methodology` (three operators, one team, no stake).
