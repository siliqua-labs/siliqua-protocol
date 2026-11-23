// Response shapes follow apps/web/lib/api/types.ts. Differences, to reconcile in ROADMAP 2.9:
// a value that does not exist yet is null instead of an invented number.
export type IndexStatus = "LIVE" | "STALE" | "INSUFFICIENT_SOURCES";

export type IndexSnapshot = {
  indexId: string;
  gpuClass: string;
  slug: string;
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
  isSample: false;
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
  isSample: false;
  index: IndexSnapshot;
  history: { endAt: string | null; points: HistoryPoint[] };
  reportingSources: number;
  sources: SourceRow[];
  medianMicroUsd: string | null;
  twap24hMicroUsd: string | null;
};

export type ApiError = { error: { code: string; message: string } };
