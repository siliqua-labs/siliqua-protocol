# SiliquaOracle v1 specification

Roadmap task 3.1. Input for the contract (3.2, owner), `oracle-node` (3.3), the report board and relayer (3.4) and the indexer (3.5). Where this file and `CLAUDE.md` conflict, `CLAUDE.md` wins, then `docs/PLAN.md`.

Status legend. **Decided**: fixed by `CLAUDE.md` or PLAN D1-D10. **PLAN default**: PLAN N4 or N5, proposed and not yet confirmed. **Proposal**: written here to make the spec complete; the owner decides, see section 12.

## 1. Scope and limits

- Three operators, all from our team, on an allowlist managed by a multisig. No stake and no slashing in v1 (D2). This limit is stated on `/oracle` and `/methodology`.
- Each operator computes the index itself from the same public inputs and signs its own value. The contract does not compute any index.
- The contract is a plain contract, not a proxy. A new version is a new deployment, listed in `OracleRegistry` (D6). Markets pin the oracle address at creation.
- Time is `block.timestamp`, never block numbers (D10).

## 2. Indexes

The oracle holds a table of indexes, each registered by the multisig:

| Field            | Meaning                                                    | GRI example        | CMI example (proposal)         |
| ---------------- | ---------------------------------------------------------- | ------------------ | ------------------------------ |
| `indexId`        | `bytes32`, `keccak256` of the ASCII id                     | `GRI-H100`         | `CMI-AGENTS`                   |
| `period`         | Slot length in seconds                                     | 3600               | 86400                          |
| `decimals`       | Decimals of `value`, informational                         | 6 (micro-USD)      | 0 (basis points)               |
| `minSources`     | Smallest `sources` a report may carry                      | 5                  | 2 (platforms)                  |
| `toleranceBps`   | Outlier tolerance around the median, in basis points       | 100 (1%)           | see section 12                 |

`toleranceBps` is a parameter (D1). `minValues` (smallest number of kept values that finalizes a slot) is a global parameter, 2 in v1.

## 3. Slots and time windows

A slot is `(indexId, timestamp)` where `timestamp` is the slot start in UTC seconds and `timestamp % period == 0`. The slot covers `[timestamp, timestamp + period)`.

A report for a slot is accepted only while

```
timestamp + period  <=  block.timestamp  <=  timestamp + period + 3 hours
```

The lower bound means a slot can only be reported after it has ended. The upper bound is the 3-hour late window (D5, PLAN N4: slot `t` accepts reports until `t + 1h + 3h` for an hourly index). `settle()` in a market is callable only after `settleTime + 3 hours`, so every slot a market needs has had its whole window.

Example. Slot `2026-11-23 08:00 UTC` is `timestamp = 1795420800`. It opens for reports at `1795424400` (09:00) and closes at `1795435200` (12:00).

## 4. Report and EIP-712

```
struct Report {
    bytes32 indexId;
    uint64  timestamp;
    uint256 value;
    uint8   sources;
    uint32  methodologyVersion;
    uint256 nonce;
}
```

The field order is fixed by `CLAUDE.md`: `indexId, timestamp, value, sources, methodologyVersion, nonce`.

Type string for the type hash:

```
Report(bytes32 indexId,uint64 timestamp,uint256 value,uint8 sources,uint32 methodologyVersion,uint256 nonce)
```

Domain separator fields (EIP-712): `name = "SiliquaOracle"`, `version = "1"`, `chainId`, `verifyingContract`. A signature is therefore valid for one chain and one oracle deployment only. Chain ids stay configuration with a `verified` flag until the owner matches them against the official docs (D10).

Signatures are 65-byte ECDSA over the EIP-712 digest. Operators are externally owned accounts; ERC-1271 is not supported in v1. The contract must reject high-`s` and non-canonical signatures so one signature has one encoding.

`value` is an integer in the index `decimals`. GRI is micro-USD per GPU-hour. `sources` is the count of valid sources behind the value. `methodologyVersion` is `major * 10000 + minor` (Proposal: `1.0` is `10000`).

## 5. Submission

Reports are submitted in a batch by anyone (PLAN default N4):

```
submit(Report[] reports, bytes[] signatures)
```

Anyone may relay, because each report carries its operator's signature. Operators run on separate Railway projects, so they hand signed reports to a small write endpoint on `api` (the report board, task 3.4); a relayer batches them and pays gas.

Validation of one report, in order. A failing report is skipped and emits `ReportRejected` with the reason; it does not revert the batch, so one bad report cannot block the others.

1. `indexId` is registered, `timestamp % period == 0`, and `0 < value < 2**128`.
2. `block.timestamp` is inside the window of section 3.
3. The signature recovers to an address on the operator allowlist.
4. `methodologyVersion` is registered by the multisig and is the same for every report of the slot.
5. `sources >= minSources` for the index.
6. The operator has no accepted report for this slot yet (one value per operator per slot).
7. The nonce is unused for this operator.

A report that passes all checks is accepted: its nonce is consumed and `OperatorValue` is emitted.

## 6. Nonces

A nonce is a unique per-operator number, not a counter (PLAN default N4). Unused nonces are tracked in a bitmap:

```
mapping(address operator => mapping(uint256 word => uint256 bits)) nonceBitmap;
word = nonce >> 8;  bit = nonce & 0xff
```

Example. Nonce `515` is word `2`, bit `3`. A nonce is consumed only when its report is accepted, so a report skipped for a recoverable reason (for example submitted a moment too early) can be resubmitted unchanged.

The nonce prevents replay across batches. Replay across chains or deployments is prevented by the domain separator.

## 7. Aggregation

All arithmetic is integer. Inputs are the accepted values of one slot, `v[0..n-1]`, one per operator.

1. Sort the values. The pre-filter median `m` is the middle value for odd `n`. For even `n` it is the mean of the two middle values, rounded half up: `(a + b + 1) / 2`.
2. Drop every value `x` with `|x - m| * 10000 > m * toleranceBps`. The comparison is strict, so a value exactly on the bound is kept. There is no division, so there is no rounding in the comparison.
3. If fewer than `minValues` (2) values are kept, the slot is not finalized by this evidence.
4. Otherwise the slot value is the median of the kept values, with the same odd and even rule as step 1: for two kept values, the mean rounded half up.

### Worked examples (`toleranceBps = 100`, GRI-H100, micro-USD)

| Case | Submitted values                     | `m`       | Kept                              | Result                      |
| ---- | ------------------------------------ | --------- | --------------------------------- | --------------------------- |
| A    | 3 520 000, 3 523 000, 3 530 000      | 3 523 000 | all three                         | 3 523 000                   |
| B    | 3 520 000, 3 523 000, 3 700 000      | 3 523 000 | first two (3 700 000 dropped)     | 3 521 500                   |
| C    | 3 520 001, 3 523 000                 | 3 521 501 | both                              | 3 521 501 (half up)         |
| D    | 3 520 000, 3 600 000                 | 3 560 000 | none: both deviate by 40 000      | not finalized               |
| D2   | 3 520 000, 3 540 000                 | 3 530 000 | both                              | 3 530 000                   |
| E    | 3 000 000, 3 500 000, 4 000 000      | 3 500 000 | only 3 500 000                    | not finalized (1 kept)      |
| F    | 3 500 000, 5 000 000, 5 000 000      | 5 000 000 | the two 5 000 000                 | 5 000 000                   |

Notes on the cases:

- B. The kept pair `3 520 000` and `3 523 000` sums to `7 043 000`, half is exactly `3 521 500`.
- C. Sum `7 043 001`, half is `3 521 500.5`, rounded half up to `3 521 501`. With two submitted values the pre-filter median is also the mean.
- D. With two submitted values both sit the same distance from their mean, so either both are kept or both are dropped. For D the distance check is `40 000 * 10000 = 400 000 000 > 3 560 000 * 100 = 356 000 000`.
- F is the known v1 limit: two colluding operators decide the value and the honest one is dropped. This is stated on `/oracle`.

## 8. Finalization and reads

- The first evidence that leaves at least `minValues` kept values finalizes the slot, and a finalized slot is immutable (PLAN default N4).
- Accepted values of a slot that is not yet finalized are stored, so a later batch recomputes over all stored values plus the new ones. This lets a single late operator complete a slot (Proposal, section 12).
- After finalization, a valid in-window report is still recorded as an observation with `counted = false` and does not change the slot (Proposal, section 12). This keeps the 0.5% operator-spread gate measurable from events.

Read functions:

```
getSlot(bytes32 indexId, uint64 timestamp)
  returns (bool finalized, uint256 value, uint8 sources, uint32 methodologyVersion, uint64 finalizedAt, uint8 keptCount)
latest(bytes32 indexId) returns (uint64 timestamp, uint256 value)
```

Consumers must check `finalized`. A slot that is not finalized after its window is stale: markets count such hours as stale (D5).

## 9. Operators and administration

- `OracleRegistry` is controlled by the multisig through a timelock and lists the approved oracle and factory versions (D6).
- Operator set (PLAN default N5): adding an operator goes through the timelock, removing one is immediate by the multisig. Removing an operator does not rewrite finished slots.
- The multisig registers indexes, methodology versions and parameters. A new methodology version takes effect no earlier than 14 days after it is announced (PLAN B9, enforced in code).
- Parameters: `minValues` (2), per-index `toleranceBps`, per-index `minSources`, the late window (3 hours). Changing a parameter does not change a finalized slot.
- No other admin action exists. There is no function to rewrite or delete a finalized value.

## 10. Events

```
OperatorAdded(address operator)
OperatorRemoved(address operator)
IndexRegistered(bytes32 indexId, uint32 period, uint8 decimals, uint8 minSources, uint16 toleranceBps)
MethodologyRegistered(uint32 methodologyVersion, uint64 effectiveFrom)
OperatorValue(bytes32 indexed indexId, uint64 indexed timestamp, address indexed operator,
              uint256 value, uint8 sources, uint32 methodologyVersion, uint256 nonce, bool counted)
ReportRejected(bytes32 indexed indexId, uint64 indexed timestamp, address operator, uint8 reason)
SlotFinalized(bytes32 indexed indexId, uint64 indexed timestamp, uint256 value,
              uint8 keptCount, uint8 submittedCount, uint32 methodologyVersion)
```

Every per-operator value is emitted (D1), including values later dropped as outliers, so the spread between operators is computed from `OperatorValue` events and not from rejections. `reason` is a small enum: unknown index, bad timestamp, window closed, window not open, unknown signer, value out of range, bad methodology, too few sources, duplicate operator, nonce used.

## 11. What the indexer and `/oracle` need

From events only: per-operator values per slot, which were kept, the finalized value, the spread `(max - min) / median` per slot, rejected reports with reason, operator list and the time each report arrived. No off-chain state is trusted for the spread gate.

## 12. Open decisions for the owner

Defaults below let work continue. Each can change before the contract is frozen (Stage 6).

1. **Partial batches.** Default: values from a batch that does not finalize are stored and counted in the next batch. Alternative: a batch is all-or-nothing and nothing is stored.
2. **Observations after finalization.** Default: valid in-window reports after finalization emit `OperatorValue` with `counted = false`. Alternative: reject them, which loses the third operator's value for the spread gate when the other two finalize first.
3. **`toleranceBps` for CMI.** A narrative share is a small integer in basis points. At 50 bps, 1% is 0.5 bp, so a one-bp rounding difference between operators drops a value. Default: GRI at 100; CMI left to its own spec (task 4.1) and set per index.
4. **`methodologyVersion` encoding.** Default `major * 10000 + minor` in a `uint32`. Alternative: a `bytes32` hash of the version string.
5. **`indexId` encoding.** Default `keccak256` of the ASCII id. Alternative: a plain `bytes32` literal.
6. **`minSources` on chain.** Default: enforced per index in the oracle. Alternative: left to the operators and checked only by `index-engine`.
7. **Value width.** Default: the struct field is `uint256` but a report is rejected unless `0 < value < 2**128`. The bound keeps `|x - m| * 10000` and the sum of two values far below `2**256`, so the aggregation cannot overflow. Alternative: a `uint128` field.

## 13. Test vectors

The same JSON drives `forge test` and the Python model `siliqua_index.oracle.aggregate` (PLAN 1.2). The file is `test-vectors/oracle-aggregation-v1.json`, read by `packages/siliqua-index/tests/test_vectors.py`. One entry per case:

```
{
  "name": "B one outlier dropped, two kept give the exact mean",
  "toleranceBps": 100,
  "minValues": 2,
  "values": [3520000, 3523000, 3700000],
  "expected": { "median": 3523000, "kept": [3520000, 3523000], "dropped": [3700000], "value": 3521500 }
}
```

`value` is `null` when the slot is not finalized. The file has 15 cases: A to F and D2 above, three equal values, a value exactly on the tolerance bound (kept), one unit past it (dropped), `n = 1`, an even count of four, input-order independence, a wider tolerance, and the largest allowed value (`2**128 - 1`). Python-signed EIP-712 fixtures (signer, digest, signature) are verified in Foundry to catch differences between `eth-account` and Solidity.

## 14. As implemented

`contracts/src/SiliquaOracle.sol`, with `Aggregation.sol` and `OracleRegistry.sol`. Where this section differs from sections 1 to 13, this section is what the code does.

- A slot is finalized at the end of a batch, over every value stored for it, not after the second report. The order of reports inside a batch therefore does not matter.
- The slot `sources` is the smallest `sources` among the values that were kept.
- `twap(indexId, from, to)` returns `(value, usedSlots, staleSlots)` and does not decide what is too stale; the market does. `from` and `to` are slot-aligned and at most 168 slots apart. The mean is rounded half up.
- `ISiliquaOracle.isOperator(address)` exists so a market can refuse bets from operators (brief, Go/No-Go).
- At most 15 operators. `admin` is meant to be a timelock owned by the multisig; `guardian` is the multisig and may only remove an operator. The first methodology version is effective immediately; later ones need 14 days of notice.
- The domain separator is computed from `block.chainid` on every call, so a signature never validates on a fork with another chain id.
- Decision 12.4 (version encoding), 12.5 (`indexId` as `keccak256`) and 12.7 (value bound `< 2**128`, field `uint256`) are implemented with their defaults.
