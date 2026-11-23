import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { type Address, type Hex, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "./app.ts";
import { type OracleDomain, type Report, typedDataFor } from "./report.ts";

const ORACLE = "0x5fbdb2315678afecb367f032d93f642f64180aa3" as Address;
const DOMAIN: OracleDomain = { chainId: 31337, oracle: ORACLE };
const OPERATOR = privateKeyToAccount(`0x${"0a".repeat(32)}`);
const STRANGER = privateKeyToAccount(`0x${"0b".repeat(32)}`);
const INDEX_ID = keccak256(toHex("GRI-H100"));

const REPORT: Report = {
  indexId: INDEX_ID,
  timestamp: 1795420800n,
  value: 3523000n,
  sources: 6,
  methodologyVersion: 10000,
  nonce: 1n,
};

function wire(report: Report, signature: Hex) {
  return {
    report: {
      indexId: report.indexId,
      timestamp: report.timestamp.toString(),
      value: report.value.toString(),
      sources: report.sources,
      methodologyVersion: report.methodologyVersion,
      nonce: report.nonce.toString(),
    },
    signature,
  };
}

async function signed(account: typeof OPERATOR, report: Report) {
  return wire(
    report,
    await account.signTypedData(typedDataFor(DOMAIN, report)),
  );
}

// Behaves like the table: one row per (operator, index, slot) and per (operator, nonce).
function fakeBoardPool() {
  const rows: Array<Record<string, string>> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("insert into oracle_reports")) {
      const [indexId, slot, operator, , , , nonce, signature] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const clash = rows.some(
        (r) =>
          r.operator === operator &&
          ((r.indexId === indexId && r.slot === slot) || r.nonce === nonce),
      );
      if (clash) return { rows: [] };
      rows.push({ indexId, slot, operator, nonce, signature });
      return { rows: [{ id: "1" }] };
    }
    if (sql.includes("select signature from oracle_reports")) {
      const [operator, indexId, slot] = params as [string, string, string];
      return {
        rows: rows.filter(
          (r) =>
            r.operator === operator && r.indexId === indexId && r.slot === slot,
        ),
      };
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  return { pool: { query } as unknown as Pool, rows };
}

async function board() {
  const fake = fakeBoardPool();
  const app = await buildApp(fake.pool, {
    reportBoard: {
      domain: DOMAIN,
      operators: new Set([OPERATOR.address.toLowerCase() as Address]),
    },
  });
  return { app, rows: fake.rows };
}

async function post(
  app: Awaited<ReturnType<typeof buildApp>>,
  reports: unknown[],
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/reports",
    payload: { reports },
  });
  return { status: response.statusCode, body: response.json() };
}

test("a report from an allowlisted operator is stored under the recovered address", async () => {
  const { app, rows } = await board();
  const { status, body } = await post(app, [await signed(OPERATOR, REPORT)]);
  assert.equal(status, 200);
  assert.deepEqual(body.results, [
    { operator: OPERATOR.address.toLowerCase(), outcome: "accepted" },
  ]);
  assert.equal(rows.length, 1);
});

test("posting the same signed report again is a duplicate, not an error", async () => {
  const { app } = await board();
  const entry = await signed(OPERATOR, REPORT);
  await post(app, [entry]);
  const { body } = await post(app, [entry]);
  assert.equal(body.results[0].outcome, "duplicate");
});

test("a different value for the same slot is a conflict", async () => {
  const { app } = await board();
  await post(app, [await signed(OPERATOR, REPORT)]);
  const other = { ...REPORT, value: 3600000n, nonce: 2n };
  const { body } = await post(app, [await signed(OPERATOR, other)]);
  assert.equal(body.results[0].outcome, "slot_conflict");
});

test("a reused nonce for another slot is refused", async () => {
  const { app } = await board();
  await post(app, [await signed(OPERATOR, REPORT)]);
  const next = { ...REPORT, timestamp: REPORT.timestamp + 3600n };
  const { body } = await post(app, [await signed(OPERATOR, next)]);
  assert.equal(body.results[0].outcome, "nonce_reused");
});

test("a signer outside the allowlist is rejected", async () => {
  const { app, rows } = await board();
  const { body } = await post(app, [await signed(STRANGER, REPORT)]);
  assert.equal(body.results[0].outcome, "rejected");
  assert.equal(body.results[0].code, "unknown_signer");
  assert.equal(rows.length, 0);
});

test("a value changed after signing recovers to another address and is rejected", async () => {
  const { app } = await board();
  const entry = await signed(OPERATOR, REPORT);
  entry.report.value = "3600000";
  const { body } = await post(app, [entry]);
  assert.equal(body.results[0].code, "unknown_signer");
});

test("a signature for another chain or oracle is rejected", async () => {
  const { app } = await board();
  const report = REPORT;
  const wrongChain = wire(
    report,
    await OPERATOR.signTypedData(
      typedDataFor({ ...DOMAIN, chainId: 1 }, report),
    ),
  );
  const wrongOracle = wire(
    report,
    await OPERATOR.signTypedData(
      typedDataFor(
        { ...DOMAIN, oracle: STRANGER.address },
        { ...report, nonce: 2n },
      ),
    ),
  );
  const { body } = await post(app, [wrongChain, wrongOracle]);
  assert.equal(body.results[0].code, "unknown_signer");
  assert.equal(body.results[1].code, "unknown_signer");
});

test("the high-s twin of a valid signature is refused", async () => {
  const { app } = await board();
  const entry = await signed(OPERATOR, REPORT);
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const s = BigInt(`0x${entry.signature.slice(66, 130)}`);
  const v = Number.parseInt(entry.signature.slice(130, 132), 16);
  const twin = `${entry.signature.slice(0, 66)}${(n - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}`;
  const { body } = await post(app, [{ ...entry, signature: twin as Hex }]);
  assert.equal(body.results[0].code, "bad_signature");
});

test("malformed fields are rejected per entry and the rest still go through", async () => {
  const { app, rows } = await board();
  const good = await signed(OPERATOR, REPORT);
  const badValue = { ...(await signed(OPERATOR, { ...REPORT, nonce: 9n })) };
  badValue.report.value = String(2n ** 128n);
  const badIndex = { ...good, report: { ...good.report, indexId: "0x12" } };
  const { body } = await post(app, [badValue, badIndex, good]);
  assert.equal(body.results[0].code, "bad_field");
  assert.equal(body.results[1].code, "bad_field");
  assert.equal(body.results[2].outcome, "accepted");
  assert.equal(rows.length, 1);
});

test("an empty or oversized batch is a 400", async () => {
  const { app } = await board();
  assert.equal((await post(app, [])).status, 400);
  const many = await signed(OPERATOR, REPORT);
  assert.equal((await post(app, new Array(17).fill(many))).status, 400);
});

test("without a configured oracle the board says so instead of accepting", async () => {
  const app = await buildApp(fakeBoardPool().pool);
  const { status, body } = await post(app, [{}]);
  assert.equal(status, 503);
  assert.equal(body.error.code, "board_disabled");
});

test("reading a slot needs a bytes32 index id and a timestamp", async () => {
  const { app } = await board();
  const bad = await app.inject({
    method: "GET",
    url: "/v1/reports?indexId=0x12&timestamp=1",
  });
  assert.equal(bad.statusCode, 400);
});
