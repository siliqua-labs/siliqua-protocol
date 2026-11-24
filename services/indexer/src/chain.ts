import {
  type Address,
  createPublicClient,
  defineChain,
  type Hex,
  http,
} from "viem";
import {
  factoryEvents,
  type IndexedLog,
  type MarketEvent,
  marketEvents,
  type OracleEvent,
  oracleEvents,
} from "./events.ts";
import type { IndexerChain } from "./indexer.ts";

export function oracleLogs(options: {
  rpcUrl: string;
  chainId: number;
  oracle: Address;
  // Set to index markets too; `known` lists the markets already stored, lowercase.
  market?: { factory: Address; known: () => Promise<Address[]> };
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
      const oracleRaw = await client.getLogs({
        address: options.oracle,
        events: oracleEvents,
        fromBlock: from,
        toBlock: to,
      });
      const out = oracleRaw.map((log) => indexed(log, decode(log)));
      if (!options.market) return out;

      const created = await client.getLogs({
        address: options.market.factory,
        events: factoryEvents,
        fromBlock: from,
        toBlock: to,
      });
      const createdEvents = created.map((log) =>
        indexed(log, decodeCreated(log)),
      );
      // Markets created inside this range can already have bets in it, so they join the list.
      const markets = new Set<Address>(await options.market.known());
      for (const entry of createdEvents) {
        if (entry.event.kind === "marketCreated")
          markets.add(entry.event.market);
      }
      const marketRaw =
        markets.size === 0
          ? []
          : await client.getLogs({
              address: [...markets],
              events: marketEvents,
              fromBlock: from,
              toBlock: to,
            });
      out.push(
        ...createdEvents,
        ...marketRaw.map((log) => indexed(log, decodeMarket(log))),
      );
      return out.sort(
        (a, b) =>
          Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex,
      );
    },
  };
}

function indexed(log: Raw, event: IndexedLog["event"]): IndexedLog {
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
    event,
  };
}

function decodeCreated(log: Raw): MarketEvent {
  if (log.eventName !== "MarketCreated") {
    throw new Error(`unexpected factory event ${log.eventName}`);
  }
  const args = log.args as {
    market: Address;
    indexId: Hex;
    threshold: bigint;
    closeTime: bigint;
    twapFrom: bigint;
    twapTo: bigint;
    feeBps: number;
    betCap: bigint;
  };
  return { kind: "marketCreated", ...args, feeBps: Number(args.feeBps) };
}

function decodeMarket(log: Raw): MarketEvent {
  const market = log.address;
  const args = log.args as {
    account: Address;
    yes: boolean;
    amount: bigint;
    twapValue: bigint;
    yesWins: boolean;
    reason: number;
  };
  switch (log.eventName) {
    case "Bought":
      return {
        kind: "bought",
        market,
        account: args.account,
        yes: args.yes,
        amount: args.amount,
      };
    case "Settled":
      return {
        kind: "settled",
        market,
        twapValue: args.twapValue,
        yesWins: args.yesWins,
      };
    case "Voided":
      return { kind: "voided", market, reason: Number(args.reason) };
    case "Claimed":
      return {
        kind: "paid",
        market,
        payout: "claimed",
        account: args.account,
        amount: args.amount,
      };
    case "Refunded":
      return {
        kind: "paid",
        market,
        payout: "refunded",
        account: args.account,
        amount: args.amount,
      };
    case "FeesSwept":
      return {
        kind: "paid",
        market,
        payout: "fees_swept",
        account: null,
        amount: args.amount,
      };
    default:
      throw new Error(`unexpected market event ${log.eventName}`);
  }
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
