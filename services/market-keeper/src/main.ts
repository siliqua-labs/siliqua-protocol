import { type Address, type Hex, isAddress, isHex } from "viem";
import { keeperChain } from "./chain.ts";
import { keepOnce, type Logger } from "./keeper.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireAddress(name: string): Address {
  const raw = requireEnv(name);
  if (!isAddress(raw, { strict: false }))
    throw new Error(`${name} is not an address: ${raw}`);
  return raw.toLowerCase() as Address;
}

function requireInteger(name: string, fallback?: string): number {
  const raw = process.env[name] ?? fallback;
  if (raw === undefined) throw new Error(`${name} is required`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return value;
}

const keeperKey = requireEnv("KEEPER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(keeperKey)) {
  throw new Error("KEEPER_PRIVATE_KEY must be 32 bytes of hex");
}
// MARKET_INDEX_ID, a single id, is still read so an existing deployment keeps working.
const rawIndexIds =
  process.env.MARKET_INDEX_IDS ?? requireEnv("MARKET_INDEX_ID");
const indexIds = rawIndexIds
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id !== "");
if (indexIds.length === 0) {
  throw new Error("MARKET_INDEX_IDS needs at least one index id");
}
for (const id of indexIds) {
  if (!isHex(id, { strict: true }) || id.length !== 66) {
    throw new Error(`index id must be a 32-byte hex string, got ${id}`);
  }
}
if (new Set(indexIds).size !== indexIds.length) {
  throw new Error("MARKET_INDEX_IDS has a duplicate id");
}

const config = {
  indexIds: indexIds as Hex[],
  closeAnchor: requireInteger("MARKET_CLOSE_ANCHOR"),
};
const chain = keeperChain({
  rpcUrl: requireEnv("RPC_URL"),
  chainId: requireInteger("CHAIN_ID"),
  factory: requireAddress("FACTORY_ADDRESS"),
  oracle: requireAddress("ORACLE_ADDRESS"),
  keeperKey: keeperKey as Hex,
});
const intervalSeconds = requireInteger("KEEPER_INTERVAL_SECONDS", "60");

function emit(level: string, message: string, fields: object): void {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
const log: Logger = {
  info: (fields, message) => emit("info", message, fields),
  warn: (fields, message) => emit("warn", message, fields),
  error: (fields, message) => emit("error", message, fields),
};

for (;;) {
  try {
    await keepOnce(chain, config, log);
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "keeper pass failed",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
}
