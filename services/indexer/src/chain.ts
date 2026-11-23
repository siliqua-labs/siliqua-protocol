import {
  type Address,
  createPublicClient,
  defineChain,
  type Hex,
  http,
} from "viem";
import { type IndexedLog, type OracleEvent, oracleEvents } from "./events.ts";
import type { IndexerChain } from "./indexer.ts";

export function oracleLogs(options: {
  rpcUrl: string;
  chainId: number;
  oracle: Address;
}): IndexerChain {
  // viem needs a chain object but only the id matters; the rest are placeholders.
  const chain = defineChain({
    id: options.chainId,
    name: `chain-${options.chainId}`,
    nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [options.rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(options.rpcUrl) });

  return {
    headNumber: () => client.getBlockNumber(),

    async blockHash(blockNumber) {
      const block = await client
        .getBlock({ blockNumber })
        .catch((error: { name?: string }) => {
          if (error.name === "BlockNotFoundError") return null;
          throw error;
        });
      return block ? (block.hash as Hex) : null;
    },

    async blockTime(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      return Number(block.timestamp);
    },

    async logs(from, to) {
      const raw = await client.getLogs({
        address: options.oracle,
        events: oracleEvents,
        fromBlock: from,
        toBlock: to,
      });
      return raw.map((log): IndexedLog => {
        if (
          log.blockNumber === null ||
          log.blockHash === null ||
          log.logIndex === null ||
          log.transactionHash === null
        ) {
          throw new Error("received a pending log from getLogs");
        }
        return {
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          logIndex: log.logIndex,
          txHash: log.transactionHash,
          event: decode(log),
        };
      });
    },
  };
}

type Raw = Awaited<
  ReturnType<ReturnType<typeof createPublicClient>["getLogs"]>
>[number] & { eventName?: string; args?: Record<string, unknown> };

// The union of every event's arguments; each case below reads only the ones its event has.
type Args = {
  indexId: Hex;
  timestamp: bigint;
  operator: Hex;
  value: bigint;
  sources: number;
  methodologyVersion: number;
  nonce: bigint;
  counted: boolean;
  reason: number;
  keptCount: number;
  submittedCount: number;
};

function decode(log: Raw): OracleEvent {
  const args = log.args as Args;
  switch (log.eventName) {
    case "OperatorValue":
      return {
        kind: "value",
        indexId: args.indexId,
        timestamp: args.timestamp,
        operator: args.operator,
        value: args.value,
        sources: Number(args.sources),
        methodologyVersion: Number(args.methodologyVersion),
        nonce: args.nonce,
        counted: args.counted,
      };
    case "ReportRejected":
      return {
        kind: "rejected",
        indexId: args.indexId,
        timestamp: args.timestamp,
        operator: args.operator,
        reason: Number(args.reason),
      };
    case "SlotFinalized":
      return {
        kind: "finalized",
        indexId: args.indexId,
        timestamp: args.timestamp,
        value: args.value,
        keptCount: Number(args.keptCount),
        submittedCount: Number(args.submittedCount),
        methodologyVersion: Number(args.methodologyVersion),
      };
    case "OperatorAdded":
      return { kind: "operator", operator: args.operator, added: true };
    case "OperatorRemoved":
      return { kind: "operator", operator: args.operator, added: false };
    default:
      throw new Error(`unexpected event ${log.eventName}`);
  }
}
