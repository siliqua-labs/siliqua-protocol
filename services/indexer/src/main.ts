import pg from "pg";
import { oracleLogs } from "./chain.ts";
import { indexOnce } from "./indexer.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerEnv(name: string, fallback: string): bigint {
  const raw = process.env[name] ?? fallback;
  if (!/^\d+$/.test(raw))
    throw new Error(`${name} must be a non-negative integer, got ${raw}`);
  return BigInt(raw);
}

const oracle = requireEnv("ORACLE_ADDRESS");
if (!/^0x[0-9a-fA-F]{40}$/.test(oracle))
  throw new Error("ORACLE_ADDRESS is not an address");
const chainId = Number(requireEnv("CHAIN_ID"));
if (!Number.isInteger(chainId) || chainId <= 0)
  throw new Error("CHAIN_ID must be a positive integer");

const pool = new pg.Pool({
  connectionString: requireEnv("DATABASE_URL"),
  max: 2,
});
const chain = oracleLogs({
  rpcUrl: requireEnv("RPC_URL"),
  chainId,
  oracle: oracle as `0x${string}`,
});
const config = {
  name: `oracle:${chainId}:${oracle.toLowerCase()}`,
  // The block the oracle was deployed in. Starting earlier is harmless, later loses events.
  startBlock: integerEnv("INDEXER_START_BLOCK", "0"),
  confirmations: integerEnv("INDEXER_CONFIRMATIONS", "0"),
  maxRange: integerEnv("INDEXER_MAX_RANGE", "1000"),
  keepBlocks: integerEnv("INDEXER_KEEP_BLOCKS", "256"),
};
const intervalMs = Number(integerEnv("INDEXER_INTERVAL_SECONDS", "5")) * 1000;

function emit(level: string, message: string, fields: object = {}): void {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
const log = {
  info: (fields: object, message: string) => emit("info", message, fields),
  warn: (fields: object, message: string) => emit("warn", message, fields),
};

for (;;) {
  try {
    // Keep going while there is a backlog; sleep only once caught up.
    for (;;) {
      const pass = await indexOnce(pool, chain, config, log);
      if (pass.to < pass.from) break;
    }
  } catch (error) {
    emit("error", "indexer pass failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
