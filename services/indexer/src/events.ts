import { type Hex, parseAbi } from "viem";

// Events of contracts/src/SiliquaOracle.sol. Kept in step with it by the local end-to-end run
// (roadmap 3.6) and by the Foundry signature fixture for the report struct.
export const oracleEvents = parseAbi([
  "event OperatorValue(bytes32 indexed indexId, uint64 indexed timestamp, address indexed operator, uint256 value, uint8 sources, uint32 methodologyVersion, uint256 nonce, bool counted)",
  "event ReportRejected(bytes32 indexed indexId, uint64 indexed timestamp, address operator, uint8 reason)",
  "event SlotFinalized(bytes32 indexed indexId, uint64 indexed timestamp, uint256 value, uint8 keptCount, uint8 submittedCount, uint32 methodologyVersion)",
  "event OperatorAdded(address operator)",
  "event OperatorRemoved(address operator)",
]);

export type OracleEvent =
  | {
      kind: "value";
      indexId: Hex;
      timestamp: bigint;
      operator: Hex;
      value: bigint;
      sources: number;
      methodologyVersion: number;
      nonce: bigint;
      counted: boolean;
    }
  | {
      kind: "rejected";
      indexId: Hex;
      timestamp: bigint;
      operator: Hex;
      reason: number;
    }
  | {
      kind: "finalized";
      indexId: Hex;
      timestamp: bigint;
      value: bigint;
      keptCount: number;
      submittedCount: number;
      methodologyVersion: number;
    }
  | { kind: "operator"; operator: Hex; added: boolean };

export type IndexedLog = {
  blockNumber: bigint;
  blockHash: Hex;
  logIndex: number;
  txHash: Hex;
  event: OracleEvent;
};
