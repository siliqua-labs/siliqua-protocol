import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import pg from "pg";
import { buildApp } from "./app.ts";
import { indexLabels, loadOracleView } from "./oracleView.ts";

// Needs a local Postgres; runs in a private schema that is dropped afterwards.
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = `oracle_view_test_${process.pid}`;
const skip = DATABASE_URL ? false : "DATABASE_URL is not set";

const INDEX_ID =
  "0x5f4173d72ba8e6e76182a9fe2ee366220e3e89a9ebfe36b16c1a6638dbcde573";
const A = `0x${"aa".repeat(20)}`;
const B = `0x${"bb".repeat(20)}`;
const C = `0x${"cc".repeat(20)}`;
const SLOT = 1795420800;
const HASH = `0x${"01".repeat(32)}`;

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
  await pool.query(
    readFileSync(
      new URL("../../../db/migrations/0003_oracle_events.sql", import.meta.url),
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

let logIndex = 0;
async function value(
  slot: number,
  operator: string,
  v: number,
  time = "2026-11-23 09:00:05+00",
) {
  await pool.query(
    `insert into oracle_operator_values
       (block_number, log_index, block_hash, tx_hash, block_time, index_id, slot_ts, operator,
        value, sources, methodology_version, nonce, counted)
     values (1, $1::int, $2, $2, $3, $4, $5, $6, $7, 6, 10000, $1::int, true)`,
    [logIndex++, HASH, time, INDEX_ID, slot, operator, v],
  );
}

const labels = indexLabels(["GRI-H100"]);

test("marks the dropped value, the median and the finalized result", {
  skip,
}, async () => {
  await value(SLOT, A, 3_520_000);
  await value(SLOT, B, 3_523_000);
  await value(SLOT, C, 3_700_000);
  await pool.query(
    `insert into oracle_slots (block_number, log_index, block_hash, block_time, index_id, slot_ts,
       value, kept_count, submitted_count, methodology_version)
     values (1, 99, $1, '2026-11-23 09:00:05+00', $2, $3, 3521500, 2, 3, 10000)`,
    [HASH, INDEX_ID, SLOT],
  );
  await pool.query(
    "insert into oracle_operator_changes (block_number, log_index, block_hash, block_time, operator, added) values (1, 100, $1, now(), $2, true), (1, 101, $1, now(), $3, true), (1, 102, $1, now(), $4, true), (2, 0, $1, now(), $4, false)",
    [HASH, A, B, C],
  );
  await pool.query(
    "insert into oracle_rejections (block_number, log_index, block_hash, tx_hash, block_time, index_id, slot_ts, operator, reason) values (3, 0, $1, $1, '2026-11-23 09:05:00+00', $2, $3, $4, 4)",
    [HASH, INDEX_ID, SLOT, C],
  );

  const view = await loadOracleView(pool, 100, labels);
  const slot = view.slots[0];
  assert.equal(slot?.indexLabel, "GRI-H100");
  assert.equal(slot?.slot, "2026-11-23T08:00:00Z");
  assert.equal(slot?.medianMicroUsd, "3523000");
  assert.equal(slot?.finalizedValueMicroUsd, "3521500");
  assert.equal(slot?.keptCount, 2);
  assert.deepEqual(
    slot?.values.map((v) => [v.operator, v.kept]),
    [
      [A, true],
      [B, true],
      [C, false],
    ],
  );
  assert.equal(
    slot?.maxGapBps,
    502,
    "5.02% from the median, in whole basis points",
  );

  assert.deepEqual(
    view.operators.map((o) => [o.address, o.active]),
    [
      [A, true],
      [B, true],
      [C, false],
    ],
    "an operator removed later is inactive",
  );
  assert.equal(view.rejections[0]?.reason, "unknown signer");
  assert.equal(view.rejections[0]?.slot, "2026-11-23T08:00:00Z");
});

test("a slot nobody finalized has no result", { skip }, async () => {
  await value(SLOT + 3600, A, 3_520_000);
  await value(SLOT + 3600, B, 3_600_000);
  const view = await loadOracleView(pool, 100, labels);
  const open = view.slots.find((s) => s.slot === "2026-11-23T09:00:00Z");
  assert.equal(open?.finalizedValueMicroUsd, null);
  assert.equal(open?.keptCount, null);
});

test("the oracle route says when it is not configured", async () => {
  const app = await buildApp({
    query: async () => ({ rows: [] }),
  } as unknown as pg.Pool);
  const response = await app.inject({ method: "GET", url: "/v1/oracle" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "oracle_not_configured");
});
