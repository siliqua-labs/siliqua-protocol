import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";
import { describeRevert } from "./tradeMath.ts";

/** A sentence we wrote for the user, safe to show as it is. */
export class UserError extends Error {}

// EIP-1193 and the codes wallets use on top of it.
const REJECTED = 4001;
const ALREADY_PENDING = -32002;

type Failure = { code?: unknown; message?: unknown; cause?: unknown };

// Wallet providers throw plain objects, and viem wraps them, so walk the causes.
function chain(error: unknown): Failure[] {
  const found: Failure[] = [];
  let next = error;
  while (typeof next === "object" && next !== null && found.length < 10) {
    found.push(next as Failure);
    next = (next as Failure).cause;
  }
  return found;
}

/** True when the user said no in the wallet, which is not a failure. */
export function isRejection(error: unknown): boolean {
  return chain(error).some(
    (e) => e.code === REJECTED || e instanceof UserRejectedRequestError,
  );
}

/**
 * One short sentence for the user. Library and RPC messages carry calldata, addresses and
 * version strings, so they are never shown; the original goes to the console instead.
 */
export function errorText(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (isRejection(error)) return "Request cancelled in your wallet.";
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      const known = describeRevert(reverted.data?.errorName);
      if (known) return known;
    }
  }
  const causes = chain(error);
  if (causes.some((e) => e.code === ALREADY_PENDING)) {
    return "A wallet request is already open. Check your wallet.";
  }
  const detail = causes.map((e) => String(e.message ?? "")).join(" ");
  if (/insufficient funds|exceeds the balance/i.test(detail)) {
    return "Not enough ETH in your wallet to pay the gas fee.";
  }
  console.error(error);
  return "The request failed. Please try again.";
}
