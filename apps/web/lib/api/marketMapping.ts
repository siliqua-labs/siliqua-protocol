import type { Market, MarketGroup, MarketStatus } from "./types";

// Shape of GET /v1/markets in services/api/src/marketView.ts. Pools are token base units.
export type ApiMarket = {
  address: string;
  indexLabel: string;
  thresholdMicroUsd: string;
  closeTime: string;
  twapFrom: string;
  twapTo: string;
  settleableFrom: string;
  feeBps: number;
  betCap: string;
  yesPool: string;
  noPool: string;
  status: "open" | "closed" | "settled" | "void";
  yesWins: boolean | null;
};

const STATUS: Record<
  ApiMarket["status"],
  { status: MarketStatus; group: MarketGroup }
> = {
  open: { status: "OPEN", group: "active" },
  closed: { status: "CLOSED", group: "active" },
  settled: { status: "SETTLED", group: "settled" },
  void: { status: "VOID", group: "void" },
};

/** Base units to whole tokens, rounded down; the UI shows pools as whole-token integers. */
export function wholeTokens(baseUnits: string, decimals: number): string {
  return (BigInt(baseUnits) / 10n ** BigInt(decimals)).toString();
}

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

export function toMarket(m: ApiMarket, decimals: number, now: Date): Market {
  const { status, group } = STATUS[m.status];
  // A closed market whose settle time has passed is waiting for someone to call settle().
  const settling =
    m.status === "closed" && now.getTime() >= Date.parse(m.settleableFrom);
  return {
    id: m.address,
    question: `Will the 24h TWAP of ${m.indexLabel} from ${utc(m.twapFrom)} to ${utc(m.twapTo)} be above the threshold?`,
    thresholdMicroUsd: m.thresholdMicroUsd,
    yesPool: wholeTokens(m.yesPool, decimals),
    noPool: wholeTokens(m.noPool, decimals),
    closesAt: m.closeTime,
    status: settling ? "SETTLING" : status,
    group,
    ...(m.yesWins === null ? {} : { winner: m.yesWins ? "YES" : "NO" }),
  };
}
