# Siliqua On-Chain Contracts are live on Robinhood Chain Testnet

Published GPU-rent index. Signed by operators. Verifiable on chain.

The oracle and market contracts are deployed on Robinhood Chain Testnet. Operators sign each hourly GRI value themselves, and the contract keeps the median, so anyone can read the index and check how it was produced. This is a testnet deployment: no audit, no value, and a single EOA stands in for the multisig and timelock that mainnet requires.

Chain ID: 46630
SiliquaOracle Deployment Block: 157,852,452
FeeRouter Deployment Block: 157,852,584
MarketFactory Deployment Block: 157,852,599

## CORE INFRASTRUCTURE

SiliquaOracle: stores the hourly index. Each operator signs its own value (EIP-712); values more than 1% from the median are dropped, at least 2 must remain, and the median is stored. Every per-operator value is emitted in an event, dropped or not.
https://explorer.testnet.chain.robinhood.com/address/0xF69DeF791E694ad4E83342732CE17Ad93396Ad95
Deploy Tx, Block 157,852,452
https://explorer.testnet.chain.robinhood.com/tx/0xd31c233baa067376138db812bea16c1b2e52ca1185b43728663f9f770bd121dd

FeeRouter: receives the market fee and splits it to three fixed addresses (50% buyback, 30% treasury, 20% operators). It never swaps or burns. Recipients cannot be changed.
https://explorer.testnet.chain.robinhood.com/address/0x25DB57936E11409dC3286Cc183f8F621c8fA67AB
Deploy Tx, Block 157,852,584
https://explorer.testnet.chain.robinhood.com/tx/0x578a55447d5889acb1bc86b0cdcdd4a119d337710ff789dfc9e96805327b7039

MarketFactory: creates the weekly range markets (RangeMarket) from one template. Each market is immutable and pins this oracle address at creation.
https://explorer.testnet.chain.robinhood.com/address/0xcfEe04038808EbC3EcB67a6350D909198C6D37B0
Deploy Tx, Block 157,852,599
https://explorer.testnet.chain.robinhood.com/tx/0x969c3671e72568671c18344a80629cc4b3256c18308a57b12898e2e632823e1b

Token: tUSDG (6 decimals), the testnet stablecoin the markets use. Not deployed by Siliqua.
https://explorer.testnet.chain.robinhood.com/address/0x3A37C1D137e02e04E1CC1e4a7dB0B4628C762b4e

## GOVERNANCE & TRUST BOUNDARIES

Admin: a single EOA on testnet, standing in for a multisig plus timelock. Admin, guardian (oracle) and owner, guardian (factory) are the same address.
https://explorer.testnet.chain.robinhood.com/address/0x21BEB3f8bdD7776FD2D5B1C6E69FB1442E7663C0
On the oracle the admin manages the operator allowlist, indexes and parameters. The guardian can only remove an operator. There is no function that rewrites or deletes a finalized value.

Operators (3): each runs its own node and signs only; none pays gas. A relayer batches the signed reports and pays gas.
Operator 1: 0x410885b7d802D0823a0391da7F9A5609F01851aF
Operator 2: 0x7a324b340da9ea8c3EcF8F40e2E057CE4c7C9D62
Operator 3: 0x1DEFE68b4b385D0d1b49363842fA2289cAFdFFEE

Keeper: registered on the factory to create markets and settle them.
https://explorer.testnet.chain.robinhood.com/address/0xf3A2C40a3108cB93E3809a57A7fc4c92309630c9

FeeRouter recipients (fixed at deploy):
50% buyback: 0x4811ea2b47ECf8AD9ad3044Faf3F205F68b706fc
30% treasury: 0xdC333e89813a3ee91b9313c5D565f69B43e161D7
20% operators: 0xD08eA5D682B5048a621fAe3667DB7c632205e25D

Deployer: 0x61b738bE2996753D31eBC986fBb6E148C4e0629a. A one-time wallet that deployed and configured, then handed all roles to the admin above.

Trust Boundaries:

- The three operators are one team and run on one infrastructure. There is no stake and no slashing in v1. Two colluding operators can set the value. This limit is stated on the /oracle and /methodology pages.
- A finalized oracle value is immutable. A late report is accepted for up to 3 hours after its slot ends.
- Markets are immutable and pin the oracle at creation. There is no admin path to rescue a running market.
- Pause stops buying only. It never blocks claim or refundIfVoid.
- Settlement is the 24h TWAP of the hourly index. A market is void with a full refund if stale time in the window exceeds 6 hours.
- Fee is 2% of the losing pool, taken at settle. The fee, bet cap and durations are factory template parameters (fee 2%, cap 1,000 whole tokens, 24h before the TWAP window, 24h TWAP window, 6h stale limit).
- Operators cannot bet in markets. This is a speed bump: it cannot stop an operator from using a second address.
- The $SILQ token is not referenced by these contracts.

Registered indexes (hourly, 6 decimals, at least 5 sources, 1% tolerance): GRI-4090, GRI-A100, GRI-B200, GRI-H100, GRI-H200. The index id is keccak256 of the label, for example keccak256("GRI-H100").

## HOW TO VERIFY AN INDEX VALUE

Read the slot from SiliquaOracle with getSlot(indexId, timestamp), then compare the OperatorValue events of that slot: they list every operator's value and whether it was counted. The published input export and the open methodology (docs/methodology/gri-v1.0.md) let anyone recompute the hour with the same package version.

## CANONICAL / NETWORK DEPENDENCIES

Robinhood Chain Testnet RPC:
https://rpc.testnet.chain.robinhood.com

Robinhood Chain Testnet Block Explorer:
https://explorer.testnet.chain.robinhood.com

Source verification:

- SiliquaOracle: verified on Sourcify (creation and runtime code match) and on Blockscout (partial match, because the build uses bytecode hash none).
- FeeRouter and MarketFactory: verified on Sourcify (creation and runtime code match). The Blockscout verifier timed out on both (they hold immutable values), so they are not shown as verified on the Blockscout explorer yet.
- RangeMarket markets are created by the factory, so each one is verified separately on Sourcify with constructor arguments read from its public immutables. The first market, 0x0860540ba32c30faa693121e6086a99aece6a7a8, is verified (creation and runtime code match). Later markets are not verified automatically yet.
- Sourcify: https://repo.sourcify.dev/46630/<address>

Build settings: Solidity 0.8.28, EVM shanghai, optimizer 200 runs, bytecode hash none.

## MAINNET

Not deployed. To be added at the mainnet deploy: chain ID 4663, the three contract addresses with deploy blocks and transactions, the multisig and timelock addresses, the published operator addresses, and the Blockscout verification status.
