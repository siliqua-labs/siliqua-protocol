import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import pg from "pg";
import { buildApp } from "./app.ts";
import { findMarket, impliedYesBps, listMarkets } from "./marketView.ts";

// The database tests need a local Postgres and run in a private schema that is dropped afterwards.
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = `market_view_test_${process.pid}`;
const skip = DATABASE_URL ? false : "DATABASE_URL is not set";

const INDEX_ID =
  "0x5f4173d72ba8e6e76182a9fe2ee366220e3e89a9ebfe36b16c1a6638dbcde573";
const MARKET = `0x${"22".repeat(20)}`;
const OTHER = `0x${"44".repeat(20)}`;
const ALICE = `0x${"aa".repeat(20)}`;
const BOB = `0x${"bb".repeat(20)}`;
const HASH = `0x${"01".repeat(32)}`;
const CLOSE = 1_795_500_000;
const TWAP_TO = CLOSE + 24 * 3600 + 24 * 3600;
const labels = new Map([[INDEX_ID, "GRI-H100"]]);

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
  // The baseline supplies gpu_classes, which the route reads for index labels.
  for (const name of ["0001_baseline.sql", "0004_market_events.sql"]) {
    await pool.query(
      readFileSync(
        new URL(`../../../db/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
});

after(async () => {
  if (!DATABASE_URL) return;
  await pool.end();
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`drop schema ${SCHEMA} cascade`);
  await admin.end();
});

let logIndex = 0;
async function createMarket(market: string, close = CLOSE) {
  await pool.query(
    `insert into markets (block_number, log_index, block_hash, block_time, market, index_id,
       threshold, close_time, twap_from, twap_to, fee_bps, bet_cap)
     values (1, $1, $2, now(), $3, $4, 3500000, $5, $6, $7, 200, 100000000)`,
    [
      logIndex++,
      HASH,
      market,
      INDEX_ID,
      close,
      close + 24 * 3600,
      close + 48 * 3600,
    ],
  );
}
async function bet(
  market: string,
  account: string,
  yes: boolean,
  amount: number,
) {
  await pool.query(
    `insert into market_bets (block_number, log_index, block_hash, block_time, market, account, yes, amount)
     values (2, $1, $2, now(), $3, $4, $5, $6)`,
    [logIndex++, HASH, market, account, yes, amount],
  );
}

async function reset() {
  await pool.query(
    "truncate markets, market_bets, market_outcomes, market_payouts",
  );
}

test("implied odds follow the contract: pools share, 5000 when empty", () => {
  assert.equal(impliedYesBps(0n, 0n), 5000);
  assert.equal(impliedYesBps(75n, 25n), 7500);
  assert.equal(impliedYesBps(1n, 2n), 3333);
  assert.equal(impliedYesBps(0n, 5n), 0);
});

test("a market is open before close and closed after it", {
  skip,
}, async () => {
  await reset();
  await createMarket(MARKET);
  const before = await findMarket(pool, MARKET, labels, CLOSE - 1);
  const after = await findMarket(pool, MARKET, labels, CLOSE);
  assert.equal(before?.status, "open");
  assert.equal(after?.status, "closed");
  assert.equal(before?.indexLabel, "GRI-H100");
  assert.equal(before?.impliedYesBps, 5000);
  assert.equal(
    before?.settleableFrom,
    new Date((TWAP_TO + 3 * 3600) * 1000).toISOString().replace(".000Z", "Z"),
  );
});

test("pools, bettors and odds come from the bets", { skip }, async () => {
  await reset();
  await createMarket(MARKET);
  await bet(MARKET, ALICE, true, 30);
  await bet(MARKET, ALICE, false, 10);
  await bet(MARKET, BOB, true, 60);
  const view = await findMarket(pool, MARKET, labels, CLOSE - 1);
  assert.equal(view?.yesPool, "90");
  assert.equal(view?.noPool, "10");
  assert.equal(view?.bettors, 2);
  assert.equal(view?.impliedYesBps, 9000);
});

test("bets of one market do not leak into another", { skip }, async () => {
  await reset();
  await createMarket(MARKET);
  await createMarket(OTHER);
  await bet(MARKET, ALICE, true, 5);
  const views = await listMarkets(pool, labels, CLOSE - 1);
  const other = views.find((v) => v.address === OTHER);
  assert.equal(other?.yesPool, "0");
  assert.equal(other?.bettors, 0);
});

test("settled and void outcomes are reported", { skip }, async () => {
  await reset();
  await createMarket(MARKET);
  await createMarket(OTHER);
  await pool.query(
    `insert into market_outcomes (block_number, log_index, block_hash, block_time, market, voided, twap_value, yes_wins)
     values (3, 0, $1, now(), $2, false, 3600000, true)`,
    [HASH, MARKET],
  );
  await pool.query(
    `insert into market_outcomes (block_number, log_index, block_hash, block_time, market, voided, void_reason)
     values (3, 1, $1, now(), $2, true, 1)`,
    [HASH, OTHER],
  );
  const settled = await findMarket(pool, MARKET, labels, CLOSE - 1);
  assert.equal(settled?.status, "settled");
  assert.equal(settled?.twapMicroUsd, "3600000");
  assert.equal(settled?.yesWins, true);
  const voided = await findMarket(pool, OTHER, labels, CLOSE - 1);
  assert.equal(voided?.status, "void");
  assert.equal(voided?.voidReason, "empty winning side");
  assert.equal(voided?.yesWins, null);
});

test("the schema refuses a void outcome without a reason", {
  skip,
}, async () => {
  await reset();
  await assert.rejects(
    pool.query(
      `insert into market_outcomes (block_number, log_index, block_hash, block_time, market, voided)
       values (3, 9, $1, now(), $2, true)`,
      [HASH, MARKET],
    ),
    /check/i,
  );
});

test("GET /v1/markets and /v1/markets/:address", { skip }, async () => {
  await reset();
  await createMarket(MARKET);
  const app = await buildApp(pool);
  const list = await app.inject({ method: "GET", url: "/v1/markets" });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().markets.length, 1);

  const one = await app.inject({ method: "GET", url: `/v1/markets/${MARKET}` });
  assert.equal(one.statusCode, 200);
  assert.equal(one.json().address, MARKET);

  const missing = await app.inject({
    method: "GET",
    url: `/v1/markets/${OTHER}`,
  });
  assert.equal(missing.statusCode, 404);
  const bad = await app.inject({ method: "GET", url: "/v1/markets/nope" });
  assert.equal(bad.statusCode, 400);
  await app.close();
});
