import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "./migrate.ts";

// Usage: pnpm --filter @siliqua/db migrate [ENV_VAR_NAME]
// The name of the variable that holds the connection string, SUPABASE_DATABASE_URL by default.
// Only the variable name is ever printed, never its value.
const variable = process.argv[2] ?? "SUPABASE_DATABASE_URL";
const url = process.env[variable];
if (!url) throw new Error(`${variable} is not set`);

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const applied = await migrate(
    pool,
    fileURLToPath(new URL("../../../db/migrations", import.meta.url)),
    {
      info: (fields, message) =>
        console.info(JSON.stringify({ message, ...fields })),
    },
  );
  console.info(
    JSON.stringify({ message: "done", variable, applied: applied.length }),
  );
} finally {
  await pool.end();
}
