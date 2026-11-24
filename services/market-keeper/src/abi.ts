import { parseAbi } from "viem";

// Subset of MarketFactory, RangeMarket and SiliquaOracle that the keeper calls.
export const factoryAbi = parseAbi([
  "function marketCount() view returns (uint256)",
  "function marketAt(uint256 i) view returns (address)",
  "function createMarket(bytes32 indexId, uint256 threshold, uint64 closeTime) returns (address)",
  "function template() view returns (address feeRouter, uint16 feeBps, uint32 betCapWholeTokens, uint32 closeBeforeTwap, uint32 twapWindow, uint32 maxStaleTime)",
  "function isKeeper(address) view returns (bool)",
]);

export const marketAbi = parseAbi([
  "function indexId() view returns (bytes32)",
  "function closeTime() view returns (uint64)",
  "function twapTo() view returns (uint64)",
  "function status() view returns (uint8)",
  "function expiresAt() view returns (uint256)",
  "function feeAccrued() view returns (uint256)",
  "function feeSwept() view returns (uint256)",
  "function settle()",
  "function sweepFees()",
]);

export const oracleAbi = parseAbi([
  "function latest(bytes32 indexId) view returns (uint64 timestamp, uint256 value)",
]);
