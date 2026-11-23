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

export const NARRATIVES = [
  "AGENTS",
  "DEPIN",
  "INFER",
  "ZKPROVE",
  "OTHER",
] as const;
export type Narrative = (typeof NARRATIVES)[number];

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
};

export type OperatorRow = {
  name: string;
  lastSignedAt: string;
  reports24h: number;
};

export type OracleReport = {
  indexId: string;
  hour: string;
  values: [string, string, string];
  medianMicroUsd: string;
  maxGapBps: number;
  result: "accepted" | "rejected";
  reason?: string;
};

export type OracleResponse = {
  isSample: boolean;
  toleranceBps: number;
  operators: OperatorRow[];
  reports: OracleReport[];
  spread24h: [number[], number[], number[]];
};
