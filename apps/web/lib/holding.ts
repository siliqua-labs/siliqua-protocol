import type { Address } from "viem";
import {
  marketAbi,
  STATUS_OPEN,
  STATUS_SETTLED,
  STATUS_VOID,
} from "./marketAbi.ts";
import type { walletClients } from "./wallet";

type PublicClient = Awaited<ReturnType<typeof walletClients>>["publicClient"];

export type Holding = {
  state: number;
  // An open market past its expiry turns void on the first refund call.
  expired: boolean;
  yes: bigint;
  no: bigint;
  claimable: bigint;
};

/** One wallet's stakes and payout in one market, read from the chain. */
export async function readHolding(
  client: PublicClient,
  market: Address,
  account: Address,
  blockTime: bigint,
): Promise<Holding> {
  const stake = (functionName: "yesStake" | "noStake" | "claimable") =>
    client.readContract({
      address: market,
      abi: marketAbi,
      functionName,
      args: [account],
    });
  const [state, expiresAt, yes, no, claimable] = await Promise.all([
    client.readContract({
      address: market,
      abi: marketAbi,
      functionName: "status",
    }),
    client.readContract({
      address: market,
      abi: marketAbi,
      functionName: "expiresAt",
    }),
    stake("yesStake"),
    stake("noStake"),
    stake("claimable"),
  ]);
  return {
    state,
    expired: state === STATUS_OPEN && blockTime >= expiresAt,
    yes,
    no,
    claimable,
  };
}

export function hasStake(h: Holding): boolean {
  return h.yes > 0n || h.no > 0n;
}

/** What the wallet can collect now: a payout from a settled market, or stakes back from a void one. */
export function collectable(h: Holding): { claim: boolean; refund: boolean } {
  return {
    claim: h.state === STATUS_SETTLED && h.claimable > 0n,
    refund: (h.state === STATUS_VOID || h.expired) && hasStake(h),
  };
}
