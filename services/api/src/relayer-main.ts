import pg from "pg";
import { oracleChain } from "./chain.ts";
import { oracleEnv } from "./env.ts";
import { relayOnce, unfinalizedSlots } from "./relayer.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const env = oracleEnv();
const relayerKey = requireEnv("RELAYER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(relayerKey)) {
  throw new Error("RELAYER_PRIVATE_KEY must be 32 bytes of hex");
}
const intervalSeconds = Number(process.env.RELAYER_INTERVAL_SECONDS ?? 30);
if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
  throw new Error("RELAYER_INTERVAL_SECONDS must be a positive integer");
}

const pool = new pg.Pool({
  connectionString: requireEnv("DATABASE_URL"),
  max: 2,
});
const chain = oracleChain({
  rpcUrl: requireEnv("RPC_URL"),
  chainId: env.chainId,
  oracle: env.oracle,
  relayerKey: relayerKey as `0x${string}`,
});
const config = {
  expectedOperators: env.operators.length,
  now: () => Math.floor(Date.now() / 1000),
};

function emit(level: string, message: string, fields: object = {}): void {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
const log = {
  info: (fields: object, message: string) => emit("info", message, fields),
  warn: (fields: object, message: string) => emit("warn", message, fields),
};
const alerted = new Set<string>();

for (;;) {
  try {
    await relayOnce(pool, chain, config, log);
    for (const slot of await unfinalizedSlots(pool, chain, config.now())) {
      const key = `${slot.indexId}:${slot.timestamp}`;
      if (alerted.has(key)) continue;
      alerted.add(key);
      emit("error", "slot not finalized after its late window", {
        indexId: slot.indexId,
        timestamp: String(slot.timestamp),
      });
    }
  } catch (error) {
    emit("error", "relayer pass failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
}
