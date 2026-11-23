# Using GRI as a price reference

Two ways, same data. Both are read-only and need no key from us.

## From a contract

`contracts/src/examples/GpuRentConsumer.sol` is a copyable example. It reads the oracle through `ISiliquaOracle`:

- `latest(indexId)` returns the newest finalized slot as `(slotStart, value)`.
- `twap(indexId, from, to)` returns the mean of the finalized slots in `[from, to)` and how many were missing.
- `getSlot(indexId, timestamp)` returns one slot, including how many operator values were kept.

Rules to follow:

- `indexId` is `keccak256` of the ASCII name, for example `keccak256("GRI-H100")`.
- GRI values are micro-USD per GPU-hour (6 decimals). CMI values are basis points (0 decimals).
- A slot with no finalized value is stale. Do not read `getSlot` without checking `finalized`.
- Decide your own staleness limit. A weekly market voids above 6 stale hours in its 24 hour window.
- The oracle address is fixed per deployment. Take it from `OracleRegistry`, and expect that a new version is a new address, not an upgrade.
- v1 trust model: three operators from one team, no stake. Do not treat the value as independent of the team.

## From HTTP

`GET /v1/indexes` and `GET /v1/indexes/{slug}` give the latest value, history and per-source prices. `GET /v1/oracle` gives the operator values and rejected reports. Every response names its methodology version.
