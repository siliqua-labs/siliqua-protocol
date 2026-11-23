import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import type { Hex } from "viem";
import {
  LAST_CHANCE_SECONDS,
  LATE_WINDOW_SECONDS,
  type OracleChain,
  relayOnce,
  STRAGGLER_GRACE_SECONDS,
  unfinalizedSlots,
} from "./relayer.ts";
import type { Report } from "./report.ts";

const INDEX_ID = `0x${"ab".repeat(32)}` as Hex;
const SLOT = 1795420800; // 2026-11-23 08:00 UTC
const PERIOD = 3600;
const OPENS = SLOT + PERIOD;
const CLOSES = OPENS + LATE_WINDOW_SECONDS;
const HASH = `0x${"cd".repeat(32)}` as Hex;
const silent = { info() {}, warn() {} };

type Row = {
  id: string;
  index_id: Hex;
  slot_ts: string;
  value: string;
  sources: number;
  methodology_version: string;
  nonce: string;
  signature: Hex;
  status: string;
  relay_tx?: Hex;
};

function row(id: number, slot = SLOT): Row {
  return {
    id: String(id),
    index_id: INDEX_ID,
    slot_ts: String(slot),
    value: "3523000",
    sources: 6,
    methodology_version: "10000",
    nonce: String(id),
    signature: `0x${"11".repeat(65)}`,
    status: "pending",
  };
}

function fakePool(rows: Row[]): Pool {
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("from oracle_reports where status = 'pending'")) {
      return { rows: rows.filter((r) => r.status === "pending") };
    }
    if (sql.includes("set status = 'expired'")) {
      for (const r of rows)
        if ((params[0] as string[]).includes(r.id)) r.status = "expired";
      return { rows: [] };
    }
    if (sql.includes("set status = 'relayed'")) {
      for (const r of rows) {
        if ((params[0] as string[]).includes(r.id)) {
          r.status = "relayed";
          r.relay_tx = params[1] as Hex;
        }
      }
      return { rows: [] };
    }
    if (sql.includes("select distinct index_id")) {
      const seen = new Map<string, Row>();
      for (const r of rows)
        if (r.status === "relayed") seen.set(`${r.index_id}:${r.slot_ts}`, r);
      return { rows: [...seen.values()] };
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  return { query } as unknown as Pool;
}

function fakeChain(
  options: { finalized?: boolean; failSubmit?: boolean } = {},
) {
  const sent: Array<{ reports: Report[]; signatures: Hex[] }> = [];
  const chain: OracleChain = {
    indexPeriod: async () => PERIOD,
    submit: async (reports, signatures) => {
      if (options.failSubmit) throw new Error("submit reverted");
      sent.push({ reports, signatures });
      return HASH;
    },
    slotFinalized: async () => options.finalized ?? true,
  };
  return { chain, sent };
}

const at = (now: number, expectedOperators = 3) => ({
  expectedOperators,
  now: () => now,
});

test("nothing is sent before the slot has ended", async () => {
  const rows = [row(1), row(2), row(3)];
  const { chain, sent } = fakeChain();
  const result = await relayOnce(fakePool(rows), chain, at(OPENS - 1), silent);
  assert.equal(sent.length, 0);
  assert.equal(result.waiting, 3);
});

test("a complete slot is sent as one batch as soon as it opens", async () => {
  const rows = [row(1), row(2), row(3)];
  const { chain, sent } = fakeChain();
  const result = await relayOnce(fakePool(rows), chain, at(OPENS), silent);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.reports.length, 3);
  assert.equal(result.submitted, 3);
  assert.ok(rows.every((r) => r.status === "relayed" && r.relay_tx === HASH));
});

test("an incomplete slot waits for stragglers, then goes after the grace period", async () => {
  const rows = [row(1), row(2)];
  const { chain, sent } = fakeChain();
  const pool = fakePool(rows);
  await relayOnce(pool, chain, at(OPENS + STRAGGLER_GRACE_SECONDS - 1), silent);
  assert.equal(sent.length, 0);
  await relayOnce(pool, chain, at(OPENS + STRAGGLER_GRACE_SECONDS), silent);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.reports.length, 2);
});

test("a late straggler goes in a later batch inside the window", async () => {
  const rows = [row(1), row(2)];
  const { chain, sent } = fakeChain();
  const pool = fakePool(rows);
  await relayOnce(pool, chain, at(OPENS + STRAGGLER_GRACE_SECONDS), silent);
  rows.push(row(3));
  await relayOnce(
    pool,
    chain,
    at(OPENS + STRAGGLER_GRACE_SECONDS + 60, 3),
    silent,
  );
  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.reports.length, 1);
});

test("reports that missed the late window are expired and never sent", async () => {
  const rows = [row(1)];
  const { chain, sent } = fakeChain();
  const result = await relayOnce(fakePool(rows), chain, at(CLOSES + 1), silent);
  assert.equal(sent.length, 0);
  assert.equal(result.expired, 1);
  assert.equal(rows[0]?.status, "expired");
});

test("the last second of the window is still sent", async () => {
  const rows = [row(1)];
  const { chain, sent } = fakeChain();
  await relayOnce(fakePool(rows), chain, at(CLOSES), silent);
  assert.equal(sent.length, 1);
  assert.ok(CLOSES - LAST_CHANCE_SECONDS > OPENS + STRAGGLER_GRACE_SECONDS);
});

test("a failed submit leaves the reports pending so the next pass retries", async () => {
  const rows = [row(1), row(2), row(3)];
  const { chain } = fakeChain({ failSubmit: true });
  await assert.rejects(
    relayOnce(fakePool(rows), chain, at(OPENS), silent),
    /submit reverted/,
  );
  assert.ok(rows.every((r) => r.status === "pending"));
});

test("reports of several slots go out in one transaction", async () => {
  const rows = [
    row(1, SLOT),
    row(2, SLOT),
    row(3, SLOT + PERIOD),
    row(4, SLOT + PERIOD),
  ];
  const { chain, sent } = fakeChain();
  await relayOnce(fakePool(rows), chain, at(OPENS + PERIOD, 2), silent);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.reports.length, 4);
});

test("a relayed slot that the oracle did not finalize is reported after its window", async () => {
  const rows = [row(1), row(2)];
  const { chain } = fakeChain({ finalized: false });
  const pool = fakePool(rows);
  await relayOnce(pool, chain, at(OPENS + STRAGGLER_GRACE_SECONDS), silent);
  assert.deepEqual(
    await unfinalizedSlots(pool, chain, CLOSES),
    [],
    "window still open",
  );
  const missing = await unfinalizedSlots(pool, chain, CLOSES + 1);
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.timestamp, BigInt(SLOT));
});

test("a finalized slot raises no alert", async () => {
  const rows = [row(1), row(2)];
  const { chain } = fakeChain({ finalized: true });
  const pool = fakePool(rows);
  await relayOnce(pool, chain, at(OPENS + STRAGGLER_GRACE_SECONDS), silent);
  assert.deepEqual(await unfinalizedSlots(pool, chain, CLOSES + 1), []);
});
