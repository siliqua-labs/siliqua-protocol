import { createPublicClient, http, isAddress, parseAbi } from "viem";

const factoryAbi = parseAbi(["function tokenDecimals() view returns (uint8)"]);

export type MarketChainConfig = { rpcUrl: string; factory: `0x${string}` };

/** Both set means markets are live on this deployment; one alone is a configuration error. */
export function marketChainConfig(): MarketChainConfig | null {
  const rpcUrl = process.env.RPC_URL;
  const factory = process.env.FACTORY_ADDRESS;
  if (!rpcUrl && !factory) return null;
  if (!rpcUrl || !factory) {
    throw new Error("RPC_URL and FACTORY_ADDRESS must be set together");
  }
  if (!isAddress(factory, { strict: false })) {
    throw new Error(`FACTORY_ADDRESS is not an address: ${factory}`);
  }
  return { rpcUrl, factory: factory.toLowerCase() as `0x${string}` };
}

/** Read from the factory, which validated it against the token at deployment (1..18). */
export async function tokenDecimals(
  config: MarketChainConfig,
): Promise<number> {
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  const decimals = await client.readContract({
    address: config.factory,
    abi: factoryAbi,
    functionName: "tokenDecimals",
  });
  if (decimals < 1 || decimals > 18) {
    throw new Error(
      `factory reports token decimals ${decimals}, expected 1..18`,
    );
  }
  return decimals;
}
