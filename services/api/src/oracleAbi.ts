import { parseAbi } from "viem";

// The subset of SiliquaOracle that the board, relayer and indexer use. Kept in step with
// contracts/src/SiliquaOracle.sol by the local end-to-end run (roadmap 3.6).
export const oracleAbi = parseAbi([
  "struct Report { bytes32 indexId; uint64 timestamp; uint256 value; uint8 sources; uint32 methodologyVersion; uint256 nonce; }",
  "struct IndexConfig { bool registered; uint32 period; uint8 decimals; uint8 minSources; uint16 toleranceBps; }",
  "function submit(Report[] reports, bytes[] signatures)",
  "function indexConfig(bytes32 indexId) view returns (IndexConfig)",
  "function getSlot(bytes32 indexId, uint64 timestamp) view returns (bool finalized, uint256 value, uint8 sources, uint32 methodologyVersion, uint64 finalizedAt, uint8 keptCount)",
  "event OperatorValue(bytes32 indexed indexId, uint64 indexed timestamp, address indexed operator, uint256 value, uint8 sources, uint32 methodologyVersion, uint256 nonce, bool counted)",
  "event ReportRejected(bytes32 indexed indexId, uint64 indexed timestamp, address operator, uint8 reason)",
  "event SlotFinalized(bytes32 indexed indexId, uint64 indexed timestamp, uint256 value, uint8 keptCount, uint8 submittedCount, uint32 methodologyVersion)",
  "event OperatorAdded(address operator)",
  "event OperatorRemoved(address operator)",
]);
