import { chains } from "@siliqua/chain";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The chain name for the footer, following CHAIN_ENV like the wallet button does (testnet when
 * unset). It never throws, because the layout renders it on every page; an unknown value shows
 * nothing instead of guessing.
 */
export function chainLabel(env: Env): string | null {
  const name = env.CHAIN_ENV || "testnet";
  if (name !== "testnet" && name !== "mainnet") return null;
  return chains[name].name;
}
