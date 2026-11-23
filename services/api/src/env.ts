import { type Address, isAddress } from "viem";
import type { ReportBoardConfig } from "./board.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function parseAddress(name: string, raw: string): Address {
  if (!isAddress(raw, { strict: false })) {
    throw new Error(`${name} is not an address: ${raw}`);
  }
  return raw.toLowerCase() as Address;
}

export type OracleEnv = {
  chainId: number;
  oracle: Address;
  operators: Address[];
};

export function oracleEnv(): OracleEnv {
  const chainId = Number(requireEnv("CHAIN_ID"));
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(
      `CHAIN_ID must be a positive integer, got ${process.env.CHAIN_ID}`,
    );
  }
  const operators = requireEnv("ORACLE_OPERATORS")
    .split(",")
    .map((item) => parseAddress("ORACLE_OPERATORS", item.trim()));
  return {
    chainId,
    oracle: parseAddress("ORACLE_ADDRESS", requireEnv("ORACLE_ADDRESS")),
    operators,
  };
}

/** The board is off until the oracle is configured; a half-set configuration is an error. */
export function reportBoardFromEnv(): ReportBoardConfig | undefined {
  const names = ["CHAIN_ID", "ORACLE_ADDRESS", "ORACLE_OPERATORS"];
  const set = names.filter((name) => process.env[name]);
  if (set.length === 0) return undefined;
  const env = oracleEnv();
  return {
    domain: { chainId: env.chainId, oracle: env.oracle },
    operators: new Set(env.operators),
  };
}

export function toleranceFromEnv(): number | undefined {
  const raw = process.env.ORACLE_TOLERANCE_BPS;
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(
      `ORACLE_TOLERANCE_BPS must be an integer in 0..10000, got ${raw}`,
    );
  }
  return value;
}
