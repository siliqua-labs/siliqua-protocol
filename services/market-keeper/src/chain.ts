import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { factoryAbi, marketAbi, oracleAbi } from "./abi.ts";
import type { KeeperChain, MarketState } from "./keeper.ts";

export function keeperChain(options: {
  rpcUrl: string;
  chainId: number;
  factory: Address;
  oracle: Address;
  keeperKey: Hex;
}): KeeperChain {
  // Only the id matters to viem; name and currency are placeholders, not chain facts.
  const chain = defineChain({
    id: options.chainId,
    name: `chain-${options.chainId}`,
    nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [options.rpcUrl] } },
  });
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({
    account: privateKeyToAccount(options.keeperKey),
    chain,
    transport,
  });

  async function confirm(hash: Hex): Promise<Hex> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error(`transaction reverted: ${hash}`);
    return hash;
  }

  async function readMarket(address: Address): Promise<MarketState> {
    const [indexId, closeTime, twapTo, status, expiresAt, accrued, swept] =
      await Promise.all([
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "indexId",
        }),
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "closeTime",
        }),
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "twapTo",
        }),
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "status",
        }),
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "expiresAt",
        }),
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "feeAccrued",
        }),
        publicClient.readContract({
          address,
          abi: marketAbi,
          functionName: "feeSwept",
        }),
      ]);
    return {
      address,
      indexId,
      closeTime: Number(closeTime),
      twapTo: Number(twapTo),
      status,
      expiresAt: Number(expiresAt),
      feeUnswept: accrued - swept,
    };
  }

  return {
    async blockTime() {
      const block = await publicClient.getBlock();
      return Number(block.timestamp);
    },

    async listMarkets() {
      const count = await publicClient.readContract({
        address: options.factory,
        abi: factoryAbi,
        functionName: "marketCount",
      });
      const addresses: Address[] = [];
      for (let i = 0n; i < count; i++) {
        addresses.push(
          await publicClient.readContract({
            address: options.factory,
            abi: factoryAbi,
            functionName: "marketAt",
            args: [i],
          }),
        );
      }
      return Promise.all(addresses.map(readMarket));
    },

    async latest(indexId) {
      const [slotStart, value] = await publicClient.readContract({
        address: options.oracle,
        abi: oracleAbi,
        functionName: "latest",
        args: [indexId],
      });
      return { slotStart: Number(slotStart), value };
    },

    async createMarket(indexId, threshold, closeTime) {
      return confirm(
        await walletClient.writeContract({
          address: options.factory,
          abi: factoryAbi,
          functionName: "createMarket",
          args: [indexId, threshold, BigInt(closeTime)],
        }),
      );
    },

    async settle(market) {
      return confirm(
        await walletClient.writeContract({
          address: market,
          abi: marketAbi,
          functionName: "settle",
        }),
      );
    },

    async sweepFees(market) {
      return confirm(
        await walletClient.writeContract({
          address: market,
          abi: marketAbi,
          functionName: "sweepFees",
        }),
      );
    },
  };
}
