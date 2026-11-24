import { parseUnits } from "viem";

const BPS = 10_000n;

/** Exact decimal text to token base units; null if malformed, zero, or too many decimals. */
export function parseStake(text: string, decimals: number): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  const value = parseUnits(trimmed, decimals);
  return value > 0n ? value : null;
}

/**
 * What RangeMarket.claim pays a winner if the pools stayed as they are: the stake back plus its
 * share of the losing pool after the fee. No fee and no extra when the losing side is empty.
 */
export function estimatePayout(
  stake: bigint,
  ownPool: bigint,
  otherPool: bigint,
  feeBps: number,
): bigint {
  const winning = ownPool + stake;
  const fee = (otherPool * BigInt(feeBps)) / BPS;
  const payoutPool = winning + otherPool - fee;
  return (stake * payoutPool) / winning;
}

/** The cap counts both sides of one address in one market. */
export function remainingCap(
  cap: bigint,
  yesStake: bigint,
  noStake: bigint,
): bigint {
  const used = yesStake + noStake;
  return used >= cap ? 0n : cap - used;
}

/** Base units to a plain decimal string, trailing zeros trimmed. */
export function formatUnitsText(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

// RangeMarket and ERC-20 errors the ticket can hit, in words a trader can act on.
const REVERTS: Record<string, string> = {
  Paused: "Buying is paused. Claims and refunds still work.",
  Closed: "This market is closed for new positions.",
  ZeroAmount: "Enter an amount above zero.",
  OperatorCannotBet: "Oracle operators cannot take positions.",
  CapExceeded: "This would go over the per-address cap.",
  ReceivedLessThanSent: "The token did not deliver the full amount; refused.",
  NotOpen: "The market is no longer open.",
  TooEarly: "Settlement opens 3 hours after the TWAP window ends.",
  AlreadyExpired: "The market expired without settlement; use refund.",
  NotSettled: "The market is not settled yet.",
  NotVoid: "The market is not void.",
  NothingToClaim: "There is nothing to collect for this address.",
};

export function describeRevert(errorName: string | undefined): string | null {
  return errorName ? (REVERTS[errorName] ?? null) : null;
}
