# Market v1 specification

Roadmap 5.1. Contracts: `MarketFactory`, `RangeMarket`, `FeeRouter` in `contracts/src`. Where this file and `CLAUDE.md` conflict, `CLAUDE.md` wins.

## Question and timeline

A market asks: is the 24 hour TWAP of one index, over `[twapFrom, twapTo)`, above `threshold`?

```
closeTime --24h--> twapFrom --24h--> twapTo --3h--> settle allowed --14d--> expiry
```

- `buy` works while `block.timestamp < closeTime`. The market closes 24 hours before the TWAP window starts.
- `settle()` works from `twapTo + 3 hours` (every slot of the window has passed its late-report window) until `expiresAt`. Anyone may call it.
- `closeBeforeTwap`, `twapWindow` and the other durations are factory template parameters. `twapFrom` and `twapTo` must sit on slot boundaries of the index and the window is at most 168 slots.

## Outcome

Order of checks in `settle()`:

1. TWAP from `oracle.twap`: mean of finalized hourly slots, rounded half up. Slots with no finalized value are stale and skipped.
2. Void and full refund if no slot is finalized, or if `staleSlots * period` is more than `maxStaleTime` (6 hours). The count is cumulative inside the window, not contiguous. Exactly 6 stale hours still settles.
3. `TWAP > threshold` is YES. Equal is NO.
4. Void and full refund, no fee, if the winning side has no stake.
5. Settled. If the losing side has no stake, winners get their stake back and no fee is taken.

## Money

- Fee is `losingPool * feeBps / 10000`, rounded down, taken at settle and accrued in the market. Anyone calls `sweepFees()` to send it to the fee router, so a failing recipient can never block settle, claim or refund.
- A winner gets `stake * (winningPool + losingPool - fee) / winningPool`, rounded down. When the last winner has claimed, rounding dust moves to the fee balance and goes to the router with it.
- A trader holding both sides keeps only the winning side's payout.
- `FeeRouter.distribute(token)` splits its whole balance 50% buyback address, 30% treasury, 20% operators; dust goes to the operators share. It never swaps or burns. The buyback address is a wallet the treasury operates (trust assumption).

## Rules per address

- Cap per address per market across both sides, in whole tokens in the template, scaled by `decimals()` read from the token when the factory is created (`1..18` or the factory refuses to deploy).
- An oracle operator cannot `buy`. This is a speed bump: it cannot stop an operator from using a second address.
- `buy` checks what the market actually received, so a token that keeps part of a transfer is refused.

## What cannot be changed

- A market copies fee, cap, durations, oracle, token and fee router at creation. A template change affects only later markets.
- No function rescues or edits a running market. `pause` lives on the factory and stops only `buy`; `claim`, `refundIfVoid` and `sweepFees` do not read it.
- If a market is still open `14 days` after the settle time (oracle broken, nobody settled), `refundIfVoid` voids it and returns every stake, and `settle` is refused. Funds can always leave.

## Roles

- Factory `owner` (a timelock owned by the multisig): template, keepers, unpause, owner and guardian changes.
- `guardian` (the multisig): pause only.
- `keeper` addresses (the `market-keeper` service): `createMarket`. Threshold and `closeTime` are chosen by the keeper; the factory only checks the schedule and that the index exists. The keeper uses the latest finalized oracle value as the threshold and does not open a market while that slot started more than 6 hours ago; it retries on every pass.

## Tests

Unit tests per branch above; fuzz on the fee split and aggregation; an invariant suite (`MarketInvariant.t.sol`) over random buy, report, settle, claim, refund, sweep and pause sequences:

- tokens are conserved: balance equals deposits minus payouts minus swept fees;
- after settle, balance equals unclaimed payouts plus unswept fees, dust included;
- a void market holds exactly what it owes;
- pause never blocks an exit.

Mutation check done by hand: a payout off by one unit and a pause check inside `claim` each fail the suite.
