import assert from "node:assert/strict";
import { test } from "node:test";
import { collectable, type Holding, hasStake } from "./holding.ts";
import { STATUS_OPEN, STATUS_SETTLED, STATUS_VOID } from "./marketAbi.ts";

const base: Holding = {
  state: STATUS_OPEN,
  expired: false,
  yes: 10n,
  no: 0n,
  claimable: 0n,
};

test("an open market has nothing to collect", () => {
  assert.deepEqual(collectable(base), { claim: false, refund: false });
});

test("a settled market pays only a wallet with a payout", () => {
  const settled = { ...base, state: STATUS_SETTLED };
  assert.deepEqual(collectable({ ...settled, claimable: 25n }), {
    claim: true,
    refund: false,
  });
  assert.deepEqual(collectable(settled), { claim: false, refund: false });
});

test("a void or expired market refunds a wallet that staked", () => {
  assert.deepEqual(collectable({ ...base, state: STATUS_VOID }), {
    claim: false,
    refund: true,
  });
  assert.deepEqual(collectable({ ...base, expired: true }), {
    claim: false,
    refund: true,
  });
});

test("a void market refunds nothing to a wallet without stakes", () => {
  const empty = { ...base, state: STATUS_VOID, yes: 0n, no: 0n };
  assert.equal(hasStake(empty), false);
  assert.deepEqual(collectable(empty), { claim: false, refund: false });
});

test("a stake on either side counts", () => {
  assert.equal(hasStake({ ...base, yes: 0n, no: 3n }), true);
});
