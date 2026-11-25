# Mainnet cutover checklist

What changes when the same deployment moves from the testnet (46630) to Robinhood Chain mainnet (4663). Contract addresses are not looked up anywhere: they are the output of the mainnet deploy. Nothing here has been run. Steps that need the owner are marked.

## 1. Before the deploy

- Pass the gates on the roadmap: legal review and contract audit (`docs/ROADMAP.md`).
- Write a mainnet deploy script. `DeployTestnet.s.sol` hands every role to one EOA and is testnet only. Mainnet needs the timelock as oracle admin and the Safe as guardian, factory owner set to the timelock, no testnet shortcuts (`docs/progres.md`, "Mainnet admin").
- Set up the Safe (2 of 3) and the timelock contract. The timelock is not in the repo and needs approval. Check that Safe supports Robinhood Chain.
- Check `PUSH0` support on mainnet (contracts target EVM `shanghai`).
- Match the mainnet USDG address and the explorer URL against `docs.robinhood.com/chain`. `packages/chain` already marks them verified, from the contracts page and the mainnet RPC; the owner confirms that once more before the deploy (CLAUDE.md, chain decisions).
- Fresh keys for the three operators, the relayer and the keeper. Do not reuse testnet keys.
- Decide `FEE_BUYBACK`, `FEE_TREASURY` and `FEE_OPERATORS`. `FeeRouter` is immutable.

## 2. Deploy

Run the mainnet script with `--broadcast`. The three printed addresses (`SiliquaOracle`, `FeeRouter`, `MarketFactory`), the deploy blocks and the transaction hashes go into the MAINNET section of `contracts/announcement.md`. They are also in `contracts/broadcast/`.

## 3. Verify source

Do all three contracts, then the first market, on Sourcify. Blockscout failed on contracts with immutables during the testnet deploy, so do not rely on it alone. The constructor arguments of a market are read from its public immutables. The testnet commands are in the git history of `contracts/announcement.md`.

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
| Railway `api` | `MARKET_INDEX_ID`, `MARKET_CLOSE_ANCHOR` | review the anchor for the first mainnet week |
| Each operator service | `CHAIN_ID=4663`, `ORACLE_ADDRESS`, `SIGNING_KEY` | new values; the node logs its address at start and it must match the allowlist |

The oracle address on the web is read from the factory, so there is no `ORACLE_ADDRESS` on Vercel.

## 5. Data

Chain data (markets, oracle events, reports) is replaced at the cutover; index and price history is kept (`memory: testnet-mainnet-single-deployment`). Clear the chain tables before the indexer starts on the new chain, or it will mix testnet rows with mainnet rows. Set `INDEXER_START_BLOCK` first.

## 6. What changes by itself

- The strip above the header disappears. Its mainnet wording waits for legal review (`lib/siteStrip.ts`).
- The footer shows `4663 · Robinhood Chain`.
- "Get free test tUSDG" in the ticket disappears (`testFaucet` is true only on testnet).
- The token becomes the mainnet USDG; decimals are read from the contract and checked.
- The contract table shows the new addresses with their verification status.

## 7. After

- `GET <api>/v1/oracle` is 200; each node logs an accepted slot; `/oracle` shows a finalized value.
- Create one market with a small cap first; buy, wait for settlement, claim.
- Update `contracts/announcement.md` with the verification status of every contract.
- State the v1 trust limits on `/oracle` and `/methodology` (three operators, one team, no stake).
