import pg from "pg";
import { buildApp } from "./app.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`PORT must be a positive integer, got ${process.env.PORT}`);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
const app = await buildApp(pool);

await app.listen({ port, host: "0.0.0.0" });
