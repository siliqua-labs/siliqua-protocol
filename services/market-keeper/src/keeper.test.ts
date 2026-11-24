import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import {
  type KeeperChain,
  keepOnce,
  type MarketState,
  MIN_BETTING_SECONDS,
  nextCloseTime,
  SETTLE_DELAY_SECONDS,
  STATUS_OPEN,
  STATUS_SETTLED,
  settleable,
  WEEK_SECONDS,
} from "./keeper.ts";

const INDEX_ID = `0x${"ab".repeat(32)}` as Hex;
const MARKET = `0x${"01".repeat(20)}` as Address;
const TX = `0x${"cd".repeat(32)}` as Hex;
const NOW = 1_800_000_000;
const ANCHOR = NOW - 10 * WEEK_SECONDS;
const config = { indexId: INDEX_ID, closeAnchor: ANCHOR };

function market(overrides: Partial<MarketState> = {}): MarketState {
  return {
    address: MARKET,
    indexId: INDEX_ID,
    closeTime: NOW - 4 * 24 * 3600,
    twapTo: NOW - SETTLE_DELAY_SECONDS - 10,
    status: STATUS_OPEN,
    expiresAt: NOW + 10 * 24 * 3600,
    feeUnswept: 0n,
    ...overrides,
  };
}

function fakeChain(markets: MarketState[], failing: string[] = []) {
  const calls: string[] = [];
  const chain: KeeperChain = {
    blockTime: async () => NOW,
    listMarkets: async () => markets,
    latestValue: async () => 3_500_000n,
    async createMarket(_index, threshold, closeTime) {
      calls.push(`create:${threshold}:${closeTime}`);
      return TX;
    },
    async settle(address) {
      calls.push(`settle:${address}`);
      if (failing.includes("settle")) throw new Error("reverted");
      return TX;
    },
    async sweepFees(address) {
      calls.push(`sweep:${address}`);
      return TX;
    },
  };
  return { chain, calls };
}

function recorder() {
  const errors: string[] = [];
  return {
    errors,
    log: {
      info() {},
      warn() {},
      error: (_f: object, m: string) => errors.push(m),
    },
  };
}

test("nextCloseTime keeps the weekly grid and the minimum betting time", () => {
  const close = nextCloseTime(NOW, ANCHOR);
  assert.equal((close - ANCHOR) % WEEK_SECONDS, 0);
  assert.ok(close >= NOW + MIN_BETTING_SECONDS);
  assert.ok(close < NOW + MIN_BETTING_SECONDS + WEEK_SECONDS);
});

test("nextCloseTime returns a far enough future anchor unchanged", () => {
  const anchor = NOW + 3 * 24 * 3600;
  assert.equal(nextCloseTime(NOW, anchor), anchor);
});

test("nextCloseTime skips a close time that leaves under 24h of betting", () => {
  const anchor = NOW + MIN_BETTING_SECONDS - 1;
  assert.equal(nextCloseTime(NOW, anchor), anchor + WEEK_SECONDS);
});

test("settleable only inside the settle window of an open market", () => {
  assert.equal(settleable(market(), NOW), true);
  assert.equal(
    settleable(market({ twapTo: NOW - SETTLE_DELAY_SECONDS + 1 }), NOW),
    false,
  );
  assert.equal(settleable(market({ expiresAt: NOW }), NOW), false);
  assert.equal(settleable(market({ status: STATUS_SETTLED }), NOW), false);
});

test("settles a ready market, sweeps a settled one and creates the next week", async () => {
  const settled = market({
    address: `0x${"02".repeat(20)}` as Address,
    status: STATUS_SETTLED,
    feeUnswept: 5n,
  });
  const { chain, calls } = fakeChain([market(), settled]);
  await keepOnce(chain, config, recorder().log);
  assert.deepEqual(calls, [
    `settle:${MARKET}`,
    `sweep:${settled.address}`,
    `create:3500000:${nextCloseTime(NOW, ANCHOR)}`,
  ]);
});

test("does not create a second market for a close time that exists", async () => {
  const closeTime = nextCloseTime(NOW, ANCHOR);
  const { chain, calls } = fakeChain([
    market({ status: STATUS_SETTLED, closeTime }),
  ]);
  await keepOnce(chain, config, recorder().log);
  assert.deepEqual(calls, []);
});

test("a failing settle is logged and does not stop market creation", async () => {
  const { chain, calls } = fakeChain([market()], ["settle"]);
  const { log, errors } = recorder();
  await keepOnce(chain, config, log);
  assert.ok(errors.includes("keeper action failed"));
  assert.ok(calls.some((c) => c.startsWith("create:")));
});

test("alerts when a market stays open an hour past its settle time", async () => {
  const late = market({ twapTo: NOW - SETTLE_DELAY_SECONDS - 3600 });
  const { chain } = fakeChain([late]);
  const { log, errors } = recorder();
  await keepOnce(chain, config, log);
  assert.ok(errors.includes("market past its settle time and still open"));
});

test("alerts on a market that expired unsettled and does not try to settle it", async () => {
  const { chain, calls } = fakeChain([market({ expiresAt: NOW - 1 })]);
  const { log, errors } = recorder();
  await keepOnce(chain, config, log);
  assert.ok(errors.includes("market expired unsettled; stakers must refund"));
  assert.ok(!calls.some((c) => c.startsWith("settle")));
});
