import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { oracleAbi } from "./oracleAbi.ts";
import type { OracleChain } from "./relayer.ts";

export function oracleChain(options: {
  rpcUrl: string;
  chainId: number;
  oracle: Address;
  relayerKey: Hex;
}): OracleChain {
  // viem needs a chain object but only the id matters. The name and currency are placeholders,
  // not facts about the chain.
  const chain = defineChain({
    id: options.chainId,
    name: `chain-${options.chainId}`,
    nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [options.rpcUrl] } },
  });
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({
    account: privateKeyToAccount(options.relayerKey),
    chain,
    transport,
  });
  const periods = new Map<Hex, number>();

  return {
    async indexPeriod(indexId) {
      const cached = periods.get(indexId);
      if (cached !== undefined) return cached;
      const config = await publicClient.readContract({
        address: options.oracle,
        abi: oracleAbi,
        functionName: "indexConfig",
        args: [indexId],
      });
      if (!config.registered) {
        throw new Error(`index ${indexId} is not registered on the oracle`);
      }
      periods.set(indexId, config.period);
      return config.period;
    },

    async submit(reports, signatures) {
      const hash = await walletClient.writeContract({
        address: options.oracle,
        abi: oracleAbi,
        functionName: "submit",
        args: [reports, signatures],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`submit reverted in ${hash}`);
      }
      return hash;
    },

    async slotFinalized(indexId, timestamp) {
      const slot = await publicClient.readContract({
        address: options.oracle,
        abi: oracleAbi,
        functionName: "getSlot",
        args: [indexId, timestamp],
      });
      return slot[0];
    },
  };
}
