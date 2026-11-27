import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import {
  type KeeperChain,
  keepOnce,
  MAX_THRESHOLD_AGE_SECONDS,
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
const ROUTER = `0x${"0a".repeat(20)}` as Address;
const NOW = 1_800_000_000;
const ANCHOR = NOW - 10 * WEEK_SECONDS;
const config = { indexIds: [INDEX_ID], closeAnchor: ANCHOR };
const OTHER_INDEX = `0x${"ef".repeat(32)}` as Hex;

function market(overrides: Partial<MarketState> = {}): MarketState {
  return {
    address: MARKET,
    indexId: INDEX_ID,
    closeTime: NOW - 4 * 24 * 3600,
    twapTo: NOW - SETTLE_DELAY_SECONDS - 10,
    status: STATUS_OPEN,
    expiresAt: NOW + 10 * 24 * 3600,
    feeUnswept: 0n,
    feeRouter: ROUTER,
    ...overrides,
  };
}

function fakeChain(markets: MarketState[], failing: string[] = []) {
  const calls: string[] = [];
  const chain: KeeperChain = {
    blockTime: async () => NOW,
    listMarkets: async () => markets,
    latest: async () => ({ slotStart: NOW - 3600, value: 3_500_000n }),
    async createMarket(index, threshold, closeTime) {
      calls.push(
        `create:${index === INDEX_ID ? "" : `${index.slice(2, 4)}:`}${threshold}:${closeTime}`,
      );
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
    routerBalance: async () => 0n,
    async distribute(router) {
      calls.push(`distribute:${router}`);
      if (failing.includes("distribute")) throw new Error("reverted");
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

test("creates one market per configured index", async () => {
  const { chain, calls } = fakeChain([
    market({ status: STATUS_SETTLED, feeUnswept: 0n }),
  ]);
  const multi = { indexIds: [INDEX_ID, OTHER_INDEX], closeAnchor: ANCHOR };
  await keepOnce(chain, multi, recorder().log);
  const created = calls.filter((c) => c.startsWith("create:"));
  assert.equal(created.length, 2);
  assert.ok(created.some((c) => c.startsWith("create:ef:")));
});

test("an index that already has its market is skipped, the other is created", async () => {
  const close = nextCloseTime(NOW, ANCHOR);
  const { chain, calls } = fakeChain([
    market({ closeTime: close, status: STATUS_SETTLED }),
  ]);
  const multi = { indexIds: [INDEX_ID, OTHER_INDEX], closeAnchor: ANCHOR };
  await keepOnce(chain, multi, recorder().log);
  const created = calls.filter((c) => c.startsWith("create:"));
  assert.equal(created.length, 1);
  assert.ok(created[0]?.startsWith("create:ef:"));
});

test("an index without a finalized value does not stop the others", async () => {
  const { chain, calls } = fakeChain([]);
  const noValue: KeeperChain = {
    ...chain,
    latest: async (index) => {
      if (index === INDEX_ID) throw new Error("no value yet");
      return { slotStart: NOW - 3600, value: 4_000_000n };
    },
  };
  const rec = recorder();
  const multi = { indexIds: [INDEX_ID, OTHER_INDEX], closeAnchor: ANCHOR };
  await keepOnce(noValue, multi, rec.log);
  assert.equal(calls.filter((c) => c.startsWith("create:")).length, 1);
});

test("does not open a market on an oracle value older than the limit", async () => {
  const cases = [
    [MAX_THRESHOLD_AGE_SECONDS, 1],
    [MAX_THRESHOLD_AGE_SECONDS + 1, 0],
  ] as const;
  for (const [age, expected] of cases) {
    const { chain, calls } = fakeChain([]);
    const aged: KeeperChain = {
      ...chain,
      latest: async () => ({ slotStart: NOW - age, value: 3_500_000n }),
    };
    const { log, errors } = recorder();
    await keepOnce(aged, config, log);
    assert.equal(calls.length, expected);
    assert.equal(errors.length, 1 - expected);
  }
});

test("splits each funded fee router once, after the sweeps", async () => {
  const other = `0x${"0b".repeat(20)}` as Address;
  const empty = `0x${"0c".repeat(20)}` as Address;
  const closeTime = nextCloseTime(NOW, ANCHOR);
  const settled = { status: STATUS_SETTLED, closeTime };
  const { chain, calls } = fakeChain([
    market({ ...settled, feeUnswept: 5n }),
    market(settled),
    market({ ...settled, feeRouter: other }),
    market({ ...settled, feeRouter: empty }),
  ]);
  const funded: KeeperChain = {
    ...chain,
    routerBalance: async (router) => (router === empty ? 0n : 5n),
  };
  await keepOnce(funded, config, recorder().log);
  assert.deepEqual(calls, [
    `sweep:${MARKET}`,
    `distribute:${ROUTER}`,
    `distribute:${other}`,
  ]);
});

test("a failing split or balance read does not stop market creation", async () => {
  const broken = `0x${"0b".repeat(20)}` as Address;
  const { chain, calls } = fakeChain(
    [
      market({ status: STATUS_SETTLED, feeRouter: broken }),
      market({ status: STATUS_SETTLED }),
    ],
    ["distribute"],
  );
  const unreadable: KeeperChain = {
    ...chain,
    routerBalance: async (router) => {
      if (router === broken) throw new Error("rpc down");
      return 5n;
    },
  };
  const { log, errors } = recorder();
  await keepOnce(unreadable, config, log);
  assert.deepEqual(errors, [
    "fee router balance unreadable",
    "keeper action failed",
  ]);
  assert.ok(calls.some((c) => c.startsWith("create:")));
});
