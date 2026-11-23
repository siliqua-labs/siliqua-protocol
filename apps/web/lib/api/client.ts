import {
  METHODOLOGY_VERSION,
  mockIndexDetail,
  mockIndexes,
  mockMarketDetail,
  mockMarkets,
  mockNarratives,
  mockOracle,
} from "./mock";
import type {
  IndexDetailResponse,
  IndexListResponse,
  MarketDetailResponse,
  MarketsResponse,
  NarrativesResponse,
  OracleResponse,
} from "./types";

// Single seam the pages read through. Index data comes from `api` when
// API_BASE_URL is set; without it the pages show sample data and say so.
// Narratives and markets stay on samples until their services exist. The oracle page reads
// /v1/oracle, which answers 503 until the oracle is configured on that deployment.
const REVALIDATE_SECONDS = 60;

async function fetchApi<T>(
  path: string,
  nullOn: number[] = [404],
): Promise<T | null> {
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error("API_BASE_URL is not set");
  const url = new URL(path, base);
  const response = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (nullOn.includes(response.status)) return null;
  if (!response.ok) {
    throw new Error(
      `GET ${url.pathname} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export async function getIndexes(): Promise<IndexListResponse> {
  if (!process.env.API_BASE_URL) {
    return {
      methodologyVersion: METHODOLOGY_VERSION,
      isSample: true,
      indexes: mockIndexes(),
    };
  }
  const body = await fetchApi<IndexListResponse>("/v1/indexes");
  if (!body) throw new Error("GET /v1/indexes returned 404");
  return body;
}

export async function getIndexDetail(
  slug: string,
): Promise<IndexDetailResponse | null> {
  if (!process.env.API_BASE_URL) return mockIndexDetail(slug);
  return fetchApi<IndexDetailResponse>(
    `/v1/indexes/${encodeURIComponent(slug)}`,
  );
}

export async function getNarratives(): Promise<NarrativesResponse> {
  return mockNarratives();
}

export async function getMarkets(): Promise<MarketsResponse> {
  return { isSample: true, markets: mockMarkets() };
}

export async function getMarketDetail(
  id: string,
): Promise<MarketDetailResponse | null> {
  const d = mockMarketDetail(id);
  return d && { isSample: true, perAddressCapTokens: 1000, ...d };
}

/** null when this deployment has no oracle configured (503); the page then says so. */
export async function getOracle(): Promise<OracleResponse | null> {
  if (!process.env.API_BASE_URL) return mockOracle();
  return fetchApi<OracleResponse>("/v1/oracle", [404, 503]);
}
