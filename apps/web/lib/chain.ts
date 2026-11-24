import {
  assertDecimals,
  type ChainName,
  chains,
  verifiedToken,
} from "@siliqua/chain";
import { createPublicClient, http, isAddress, parseAbi } from "viem";
import type { LiveConfig } from "./wallet";

const factoryAbi = parseAbi([
  "function tokenDecimals() view returns (uint8)",
  "function token() view returns (address)",
]);

export type MarketChainConfig = {
  chainEnv: ChainName;
  rpcUrl: string;
  factory: `0x${string}`;
};

/** All three set means markets are live on this deployment; a partial set is an error. */
export function marketChainConfig(): MarketChainConfig | null {
  const chainEnv = process.env.CHAIN_ENV;
  const rpcUrl = process.env.RPC_URL;
  const factory = process.env.FACTORY_ADDRESS;
  if (!chainEnv && !rpcUrl && !factory) return null;
  if (!chainEnv || !rpcUrl || !factory) {
    throw new Error(
      "CHAIN_ENV, RPC_URL and FACTORY_ADDRESS must be set together",
    );
  }
  if (chainEnv !== "testnet" && chainEnv !== "mainnet") {
    throw new Error(`CHAIN_ENV must be testnet or mainnet, got ${chainEnv}`);
  }
  if (!isAddress(factory, { strict: false })) {
    throw new Error(`FACTORY_ADDRESS is not an address: ${factory}`);
  }
  return { chainEnv, rpcUrl, factory: factory.toLowerCase() as `0x${string}` };
}

/**
 * The factory's token must be the verified one and its decimals must match what was verified;
 * otherwise a wrong deployment would show wrong amounts and ask the wallet to approve it.
 */
export async function tokenDecimals(
  config: MarketChainConfig,
): Promise<number> {
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  const [decimals, token] = await Promise.all([
    client.readContract({
      address: config.factory,
      abi: factoryAbi,
      functionName: "tokenDecimals",
    }),
    client.readContract({
      address: config.factory,
      abi: factoryAbi,
      functionName: "token",
    }),
  ]);
  const expected = verifiedToken(config.chainEnv);
  if (token.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `factory token ${token} is not the verified ${config.chainEnv} token ${expected}`,
    );
  }
  assertDecimals(config.chainEnv, decimals);
  return decimals;
}

/** What the browser needs; refuses any chain value that was not verified. */
export function liveConfig(
  config: MarketChainConfig,
  decimals: number,
  feeBps: number,
): LiveConfig {
  const chain = chains[config.chainEnv];
  for (const field of [
    chain.chainId,
    chain.publicRpcUrl,
    chain.explorerUrl,
    chain.nativeSymbol,
  ]) {
    if (!field.verified) {
      throw new Error(`${config.chainEnv} chain configuration is not verified`);
    }
  }
  return {
    chainId: chain.chainId.value,
    chainName: chain.name,
    rpcUrl: chain.publicRpcUrl.value,
    explorerUrl: chain.explorerUrl.value,
    nativeSymbol: chain.nativeSymbol.value,
    token: verifiedToken(config.chainEnv),
    tokenSymbol: chain.token.symbol,
    decimals,
    feeBps,
  };
}
