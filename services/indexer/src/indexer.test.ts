import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import pg from "pg";
import type { Hex } from "viem";
import type { IndexedLog, MarketEvent, OracleEvent } from "./events.ts";

type AnyEvent = OracleEvent | MarketEvent;

import { type IndexerChain, type IndexerConfig, indexOnce } from "./indexer.ts";

// Runs against a local Postgres in a private schema that is dropped afterwards:
//   DATABASE_URL=postgresql://... node --test src/
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = `indexer_test_${process.pid}`;
const skip = DATABASE_URL ? false : "DATABASE_URL is not set";

const INDEX_ID = `0x${"ab".repeat(32)}` as Hex;
const OPERATOR = `0x${"11".repeat(20)}` as Hex;
const silent = { info() {}, warn() {} };

let pool: pg.Pool;

before(async () => {
  if (!DATABASE_URL) return;
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`create schema ${SCHEMA}`);
  await admin.end();
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    options: `-c search_path=${SCHEMA}`,
    max: 2,
  });
  const migration = readFileSync(
    new URL("../../../db/migrations/0003_oracle_events.sql", import.meta.url),
    "utf8",
  );
  await pool.query(migration);
  await pool.query(
    readFileSync(
      new URL("../../../db/migrations/0004_market_events.sql", import.meta.url),
      "utf8",
    ),
  );
});

after(async () => {
  if (!DATABASE_URL) return;
  await pool.end();
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`drop schema ${SCHEMA} cascade`);
  await admin.end();
});

// A chain made of blocks; `fork` replaces everything from a height with new blocks.
class FakeChain implements IndexerChain {
  blocks: Array<{ hash: Hex; time: number; events: AnyEvent[] }> = [];
  tag = 0;

  mine(events: AnyEvent[] = []): void {
    const number = this.blocks.length;
    this.blocks.push({
      hash: this.hashOf(number),
      time: 1_795_420_800 + number * 12,
      events,
    });
  }

  fork(fromNumber: number, ...next: AnyEvent[][]): void {
    this.tag += 1;
    this.blocks.length = fromNumber;
    for (const events of next) this.mine(events);
  }

  private hashOf(number: number): Hex {
    return `0x${(this.tag * 1000 + number).toString(16).padStart(64, "0")}`;
  }

  async headNumber() {
    return BigInt(this.blocks.length - 1);
  }
  async blockHash(n: bigint) {
    return this.blocks[Number(n)]?.hash ?? null;
  }
  async blockTime(n: bigint) {
    return this.blocks[Number(n)]?.time ?? 0;
  }
  async logs(from: bigint, to: bigint): Promise<IndexedLog[]> {
    const out: IndexedLog[] = [];
    for (let n = Number(from); n <= Number(to); n++) {
      const block = this.blocks[n];
      if (!block) continue;
      for (const [logIndex, event] of block.events.entries()) {
        out.push({
          blockNumber: BigInt(n),
          blockHash: block.hash,
          logIndex,
          txHash: `0x${"ee".repeat(32)}`,
          event,
        });
      }
    }
    return out;
  }
}

const value = (timestamp: bigint, v = 3523000n): OracleEvent => ({
  kind: "value",
  indexId: INDEX_ID,
  timestamp,
  operator: OPERATOR,
  value: v,
  sources: 6,
  methodologyVersion: 10000,
  nonce: timestamp,
  counted: true,
});
const finalized = (timestamp: bigint, v = 3523000n): OracleEvent => ({
  kind: "finalized",
  indexId: INDEX_ID,
  timestamp,
  value: v,
  keptCount: 3,
  submittedCount: 3,
  methodologyVersion: 10000,
});

const config = (overrides: Partial<IndexerConfig> = {}): IndexerConfig => ({
  name: `test-${Math.random()}`,
  startBlock: 0n,
  confirmations: 0n,
  maxRange: 1000n,
  keepBlocks: 256n,
  ...overrides,
});

async function count(table: string): Promise<number> {
  const result = await pool.query(`select count(*)::int as n from ${table}`);
  return result.rows[0].n;
}

async function reset(): Promise<void> {
  await pool.query(
    "truncate oracle_operator_values, oracle_rejections, oracle_slots, oracle_operator_changes, markets, market_bets, market_outcomes, market_payouts, chain_blocks, indexer_state",
  );
}

test("stores every kind of event with its block time", { skip }, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine();
  chain.mine([
    { kind: "operator", operator: OPERATOR, added: true },
    value(100n),
    {
      kind: "rejected",
      indexId: INDEX_ID,
      timestamp: 100n,
      operator: OPERATOR,
      reason: 8,
    },
    finalized(100n),
  ]);
  const result = await indexOnce(pool, chain, config(), silent);
  assert.equal(result.events, 4);
  assert.equal(await count("oracle_operator_values"), 1);
  assert.equal(await count("oracle_rejections"), 1);
  assert.equal(await count("oracle_slots"), 1);
  assert.equal(await count("oracle_operator_changes"), 1);
  const row = await pool.query(
    "select value::text, extract(epoch from block_time)::bigint as t from oracle_slots",
  );
  assert.equal(row.rows[0].value, "3523000");
  assert.equal(row.rows[0].t, "1795420812");
});

test("a second pass with nothing new writes nothing and the cursor stays", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([value(100n)]);
  const cfg = config();
  await indexOnce(pool, chain, cfg, silent);
  const again = await indexOnce(pool, chain, cfg, silent);
  assert.equal(again.events, 0);
  assert.equal(await count("oracle_operator_values"), 1);
});

test("new blocks are picked up from the cursor, not from the start", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([value(100n)]);
  const cfg = config();
  await indexOnce(pool, chain, cfg, silent);
  chain.mine([value(200n)]);
  const result = await indexOnce(pool, chain, cfg, silent);
  assert.equal(result.from, 1n);
  assert.equal(result.events, 1);
  assert.equal(await count("oracle_operator_values"), 2);
});

test("a long range is read in pieces of at most maxRange blocks", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  for (let i = 0; i < 10; i++) chain.mine([value(BigInt(100 + i))]);
  const cfg = config({ maxRange: 4n });
  const first = await indexOnce(pool, chain, cfg, silent);
  assert.equal(first.to - first.from, 3n);
  while ((await indexOnce(pool, chain, cfg, silent)).events > 0);
  assert.equal(await count("oracle_operator_values"), 10);
});

test("confirmations keep the indexer behind the head", { skip }, async () => {
  await reset();
  const chain = new FakeChain();
  for (let i = 0; i < 5; i++) chain.mine([value(BigInt(100 + i))]);
  await indexOnce(pool, chain, config({ confirmations: 2n }), silent);
  assert.equal(await count("oracle_operator_values"), 3);
});

test("a reorg removes the events of the abandoned blocks and indexes the new ones", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine();
  chain.mine([value(100n), finalized(100n, 3500000n)]);
  chain.mine([value(200n)]);
  chain.mine([value(300n), finalized(300n, 3600000n)]);
  const cfg = config();
  await indexOnce(pool, chain, cfg, silent);
  assert.equal(await count("oracle_slots"), 2);

  // Blocks 2 and 3 are replaced; the slot of timestamp 300 now finalizes differently.
  chain.fork(
    2,
    [value(250n)],
    [value(300n), finalized(300n, 3700000n), value(400n)],
  );
  const result = await indexOnce(pool, chain, cfg, silent);
  assert.equal(result.reorgedTo, 1n);
  assert.equal(await count("oracle_operator_values"), 4, "100, 250, 300, 400");
  const slots = await pool.query(
    "select slot_ts::text, value::text from oracle_slots order by slot_ts",
  );
  assert.deepEqual(slots.rows, [
    { slot_ts: "100", value: "3500000" },
    { slot_ts: "300", value: "3700000" },
  ]);
  const gone = await pool.query(
    "select 1 from oracle_operator_values where slot_ts = 200",
  );
  assert.equal(gone.rows.length, 0);
});

test("a reorg that only changes the tip is unwound too", { skip }, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([value(100n)]);
  chain.mine([value(200n)]);
  const cfg = config();
  await indexOnce(pool, chain, cfg, silent);
  chain.fork(1, []);
  await indexOnce(pool, chain, cfg, silent);
  assert.equal(await count("oracle_operator_values"), 1);
  const state = await pool.query(
    "select block_number::text from indexer_state where name = $1",
    [cfg.name],
  );
  assert.equal(state.rows[0].block_number, "1");
});

test("a reorg deeper than the kept block hashes fails loudly", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  for (let i = 0; i < 10; i++) chain.mine([value(BigInt(100 + i))]);
  const cfg = config({ keepBlocks: 2n, maxRange: 1n });
  while ((await indexOnce(pool, chain, cfg, silent)).to < 9n);
  chain.fork(2, ...new Array(8).fill([]));
  await assert.rejects(
    indexOnce(pool, chain, cfg, silent),
    /reorg deeper than/,
  );
});

test("logs that no longer belong to the canonical chain are not written", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([value(100n)]);
  chain.mine([value(200n)]);
  const original = chain.logs.bind(chain);
  // The chain reorganizes right after getLogs answered.
  chain.logs = async (from, to) => {
    const stale = await original(from, to);
    chain.fork(1, [value(999n)]);
    return stale;
  };
  const cfg = config();
  await assert.rejects(
    indexOnce(pool, chain, cfg, silent),
    /chain changed while reading/,
  );
  assert.equal(await count("oracle_operator_values"), 0);
  assert.equal(await count("indexer_state"), 0);
});

test("a duplicate finalization for one slot is refused by the schema", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([finalized(100n), finalized(100n, 1n)]);
  await assert.rejects(
    indexOnce(pool, chain, config(), silent),
    /unique|duplicate/i,
  );
  assert.equal(await count("oracle_slots"), 0, "the whole range rolled back");
});

const MARKET = `0x${"22".repeat(20)}` as Hex;
const TRADER = `0x${"33".repeat(20)}` as Hex;
const created = (): MarketEvent => ({
  kind: "marketCreated",
  market: MARKET,
  indexId: INDEX_ID,
  threshold: 3500000n,
  closeTime: 1000n,
  twapFrom: 87400n,
  twapTo: 173800n,
  feeBps: 200,
  betCap: 100000000n,
});

test("stores the market lifecycle", { skip }, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([
    created(),
    { kind: "bought", market: MARKET, account: TRADER, yes: true, amount: 5n },
  ]);
  chain.mine([
    { kind: "settled", market: MARKET, twapValue: 3600000n, yesWins: true },
    {
      kind: "paid",
      market: MARKET,
      payout: "claimed",
      account: TRADER,
      amount: 5n,
    },
    {
      kind: "paid",
      market: MARKET,
      payout: "fees_swept",
      account: null,
      amount: 1n,
    },
  ]);
  await indexOnce(pool, chain, config(), silent);
  assert.equal(await count("markets"), 1);
  assert.equal(await count("market_bets"), 1);
  assert.equal(await count("market_outcomes"), 1);
  assert.equal(await count("market_payouts"), 2);
});

test("a void outcome keeps its reason and has no winner", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine([created(), { kind: "voided", market: MARKET, reason: 1 }]);
  await indexOnce(pool, chain, config(), silent);
  const row = (await pool.query("select * from market_outcomes")).rows[0];
  assert.equal(row.voided, true);
  assert.equal(row.void_reason, 1);
  assert.equal(row.yes_wins, null);
});

test("a reorg removes market rows of the abandoned blocks", {
  skip,
}, async () => {
  await reset();
  const chain = new FakeChain();
  chain.mine();
  chain.mine([created()]);
  chain.mine([
    { kind: "bought", market: MARKET, account: TRADER, yes: false, amount: 7n },
  ]);
  const cfg = config();
  await indexOnce(pool, chain, cfg, silent);
  chain.fork(2, []);
  chain.mine();
  await indexOnce(pool, chain, cfg, silent);
  assert.equal(await count("markets"), 1);
  assert.equal(await count("market_bets"), 0);
});
