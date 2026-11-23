import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { buildApp } from "./app.ts";

const HOUR = new Date(Date.UTC(2027, 0, 1, 10));

// Answers the few queries the routes issue, keyed by a fragment of the SQL.
function stubPool(): Pool {
  const query = async (sql: string) => {
    if (sql.includes("from gpu_classes")) {
      return { rows: [{ id: "h100", sku: "H100 80GB SXM" }] };
    }
    if (sql.includes("max(hour)")) return { rows: [{ hour: HOUR }] };
    if (sql.includes("hour < $2")) return { rows: [] };
    if (sql.includes("from gri_hourly where index_id")) {
      return {
        rows: [
          {
            hour: HOUR,
            value: "4.390000",
            valid_sources: 5,
            status: "LIVE",
            methodology_version: "1.0",
          },
        ],
      };
    }
    if (sql.includes("from gri_inputs")) {
      return {
        rows: [
          { source_id: "runpod", price: "4.390000", kept: true },
          { source_id: "vastai", price: "9.000000", kept: false },
        ],
      };
    }
    if (sql.includes("order by hour desc limit 1")) {
      return { rows: [{ methodology_version: "1.0" }] };
    }
    if (sql.includes("select 1")) return { rows: [{}] };
    throw new Error(`unexpected query: ${sql}`);
  };
  return { query } as unknown as Pool;
}

test("list returns snapshots with integer micro-USD strings", async () => {
  const app = await buildApp(stubPool());
  const response = await app.inject({ method: "GET", url: "/v1/indexes" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "*");
  const body = response.json();
  assert.equal(body.methodologyVersion, "1.0");
  assert.equal(body.isSample, false);
  assert.equal(body.indexes[0].valueMicroUsd, "4390000");
  assert.equal(body.indexes[0].indexId, "GRI-H100");
  assert.equal(body.indexes[0].change24hBps, null);
  await app.close();
});

test("detail lists sources and takes the median of kept ones only", async () => {
  const app = await buildApp(stubPool());
  const response = await app.inject({ method: "GET", url: "/v1/indexes/h100" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.reportingSources, 2);
  assert.equal(body.medianMicroUsd, "4390000");
  assert.equal(body.sources[1].included, false);
  assert.equal(body.history.endAt, "2027-01-01T10:00:00Z");
  await app.close();
});

test("unknown index and unknown route use the error shape", async () => {
  const app = await buildApp(stubPool());
  const missing = await app.inject({ method: "GET", url: "/v1/indexes/nope" });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "not_found");
  const route = await app.inject({ method: "GET", url: "/v1/other" });
  assert.equal(route.statusCode, 404);
  assert.equal(route.json().error.code, "not_found");
  await app.close();
});

test("rate limit answers 429 in the error shape", async () => {
  const app = await buildApp(stubPool(), { rateLimitPerMinute: 2 });
  await app.inject({ method: "GET", url: "/health" });
  await app.inject({ method: "GET", url: "/health" });
  const limited = await app.inject({ method: "GET", url: "/health" });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, "rate_limited");
  await app.close();
});

test("database failure returns a generic 500", async () => {
  const pool = {
    query: async () => {
      throw new Error("connection refused");
    },
  } as unknown as Pool;
  const app = await buildApp(pool);
  const response = await app.inject({ method: "GET", url: "/v1/indexes" });
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, "internal_error");
  assert.ok(!response.body.includes("connection refused"));
  await app.close();
});
