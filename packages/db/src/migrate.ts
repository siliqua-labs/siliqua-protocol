import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";

// Arbitrary constant: one migration run at a time per database.
const LOCK_KEY = 7_424_001;

export type MigrateLog = { info(fields: object, message: string): void };

/**
 * Applies the .sql files of `dir` that are not recorded yet, in name order. Each file carries its
 * own begin/commit, so a failing file leaves no partial change and is not recorded; later files
 * are not tried.
 */
export async function migrate(
  pool: Pool,
  dir: string,
  log: MigrateLog,
): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    await client.query(
      "alter table schema_migrations enable row level security",
    );
    const done = new Set(
      (
        await client.query<{ name: string }>(
          "select name from schema_migrations",
        )
      ).rows.map((row) => row.name),
    );
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) {
      if (done.has(name)) continue;
      try {
        await client.query(readFileSync(join(dir, name), "utf8"));
      } catch (error) {
        // The file's own transaction is left aborted on the session; clear it before unlocking.
        await client.query("rollback");
        throw new Error(
          `migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await client.query("insert into schema_migrations (name) values ($1)", [
        name,
      ]);
      applied.push(name);
      log.info({ migration: name }, "applied");
    }
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [LOCK_KEY])
      .catch(() => {
        // The session is closing anyway; the lock goes with it.
      });
    client.release();
  }
  return applied;
}
