// Mirrors the planned /v1 responses (PLAN B8). Prices are integer micro-USD
// strings (6 decimals) and pool sizes are whole-token integer strings, so no
// float ever touches a money value.
export type IndexStatus = "LIVE" | "STALE" | "INSUFFICIENT_SOURCES";
export type MarketStatus =
  | "OPEN"
  | "CLOSED"
  | "SETTLING"
  | "SETTLED"
  | "VOID"
  | "NOT_LIVE";
export type ChipStatus = IndexStatus | MarketStatus;

export type IndexSnapshot = {
  indexId: string;
  gpuClass: string;
  slug: string;
  // Null until the index has published a value (or enough history for a change).
  valueMicroUsd: string | null;
  change24hBps: number | null;
  change7dBps: number | null;
  validSources: number;
  minValidSources: number;
  updatedAt: string | null;
  status: IndexStatus;
  methodologyVersion: string;
  trend7d: string[];
};

export type IndexListResponse = {
  methodologyVersion: string;
  isSample: boolean;
  indexes: IndexSnapshot[];
};

export type HistoryPoint = { value: string; stale: boolean };

export type SourceRow = {
  name: string;
  priceMicroUsd: string;
  included: boolean;
  fetchedAt: string;
};

export type IndexDetailResponse = {
  methodologyVersion: string;
  isSample: boolean;
  index: IndexSnapshot;
  history: { endAt: string | null; points: HistoryPoint[] };
  reportingSources: number;
  sources: SourceRow[];
  medianMicroUsd: string | null;
  twap24hMicroUsd: string | null;
};

// Narrative names come from the api. This list only feeds the sample data.
export const NARRATIVES = [
  "AGENTS",
  "DEPIN",
  "INFER",
  "ZKPROVE",
  "OTHER",
] as const;
export type Narrative = string;

export type NarrativeDay = {
  date: string;
  stale: boolean;
  bps: Record<Narrative, number> | null;
};

export type PostRow = {
  platform: "X" | "Farcaster" | "Bluesky";
  postId: string;
  label: Narrative;
  botScore: string;
  modelHash: string;
  weightShareBps: number;
};

export type NarrativesResponse = {
  methodologyVersion: string;
  isSample: boolean;
  days: NarrativeDay[];
  posts: { narrative: Narrative; rows: PostRow[] }[];
};

export type MarketGroup = "active" | "upcoming" | "settled" | "void";

export type Market = {
  id: string;
  // Present for real markets, e.g. GRI-H100; the portfolio uses it as a short name.
  indexLabel?: string;
  question: string;
  thresholdMicroUsd: string;
  yesPool: string;
  noPool: string;
  closesAt: string;
  status: MarketStatus;
  group: MarketGroup;
  winner?: "YES" | "NO";
};

export type MarketsResponse = { isSample: boolean; markets: Market[] };

export type MarketDetailResponse = {
  isSample: boolean;
  market: Market;
  windowPoints: HistoryPoint[];
  windowEndAt: string;
  perAddressCapTokens: number;
  // Real markets carry their own schedule; samples fall back to the page's fixed week.
  timeline?: { when: string; what: string }[];
  factory?: string;
  // Present for real markets: what the ticket needs to talk to the chain.
  live?: {
    config: import("../wallet").LiveConfig;
    // Token base units, exact, unlike the whole-token pools on `market`.
    capBase: string;
    yesPoolBase: string;
    noPoolBase: string;
  };
};

export type OperatorRow = {
  address: string;
  active: boolean;
  lastSignedAt: string | null;
  reports24h: number;
};

export type OracleSlotValue = {
  operator: string;
  valueMicroUsd: string;
  kept: boolean;
  gapBps: number;
  deviationBps: number;
};

export type OracleSlot = {
  indexId: string;
  indexLabel: string;
  slot: string;
  values: OracleSlotValue[];
  medianMicroUsd: string;
  maxGapBps: number;
  finalizedValueMicroUsd: string | null;
  keptCount: number | null;
};

export type OracleRejection = {
  indexLabel: string;
  slot: string;
  operator: string;
  reason: string;
  at: string;
};

export type OracleResponse = {
  isSample: boolean;
  toleranceBps: number;
  operators: OperatorRow[];
  slots: OracleSlot[];
  rejections: OracleRejection[];
};
