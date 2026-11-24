import { parseAbi } from "viem";

// The parts of RangeMarket the page uses. Errors are listed so a failed simulation decodes to a
// name instead of "execution reverted".
export const marketAbi = parseAbi([
  "function buy(bool yes, uint256 amount)",
  "function claim()",
  "function refundIfVoid()",
  "function status() view returns (uint8)",
  "function expiresAt() view returns (uint256)",
  "function pauseSource() view returns (address)",
  "function yesStake(address) view returns (uint256)",
  "function noStake(address) view returns (uint256)",
  "function claimable(address) view returns (uint256)",
  "error Paused()",
  "error Closed()",
  "error ZeroAmount()",
  "error OperatorCannotBet()",
  "error CapExceeded()",
  "error ReceivedLessThanSent()",
  "error NotOpen()",
  "error TooEarly()",
  "error AlreadyExpired()",
  "error NotSettled()",
  "error NotVoid()",
  "error NothingToClaim()",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const pauseAbi = parseAbi(["function paused() view returns (bool)"]);

// RangeMarket.Status order.
export const STATUS_OPEN = 0;
export const STATUS_SETTLED = 1;
export const STATUS_VOID = 2;
