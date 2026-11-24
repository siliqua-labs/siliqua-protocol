import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import pg from "pg";
import { migrate } from "./migrate.ts";

// Needs a local Postgres; runs in a private schema that is dropped afterwards.
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = `migrate_test_${process.pid}`;
const skip = DATABASE_URL ? false : "DATABASE_URL is not set";
const silent = { info() {} };

let pool: pg.Pool;
let dir: string;

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
  dir = mkdtempSync(join(tmpdir(), "migrate-"));
});

after(async () => {
  if (!DATABASE_URL) return;
  await pool.end();
  rmSync(dir, { recursive: true, force: true });
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`drop schema ${SCHEMA} cascade`);
  await admin.end();
});

test("applies pending files in name order and skips recorded ones", {
  skip,
}, async () => {
  writeFileSync(
    join(dir, "0002_b.sql"),
    "begin; create table b (id int); commit;",
  );
  writeFileSync(
    join(dir, "0001_a.sql"),
    "begin; create table a (id int); commit;",
  );
  assert.deepEqual(await migrate(pool, dir, silent), [
    "0001_a.sql",
    "0002_b.sql",
  ]);
  assert.deepEqual(await migrate(pool, dir, silent), []);
  writeFileSync(
    join(dir, "0003_c.sql"),
    "begin; create table c (id int); commit;",
  );
  assert.deepEqual(await migrate(pool, dir, silent), ["0003_c.sql"]);
});

test("a failing file leaves no trace and stops later files", {
  skip,
}, async () => {
  writeFileSync(
    join(dir, "0004_bad.sql"),
    "begin; create table d (id int); select 1/0; commit;",
  );
  writeFileSync(
    join(dir, "0005_after.sql"),
    "begin; create table e (id int); commit;",
  );
  await assert.rejects(migrate(pool, dir, silent), /0004_bad\.sql failed/);
  const tables = await pool.query(
    "select table_name from information_schema.tables where table_schema = $1 and table_name in ('d', 'e')",
    [SCHEMA],
  );
  assert.equal(tables.rowCount, 0);
  const recorded = await pool.query(
    "select name from schema_migrations where name = '0004_bad.sql'",
  );
  assert.equal(recorded.rowCount, 0);
});
