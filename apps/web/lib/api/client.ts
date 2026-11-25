import { liveConfig, marketChainConfig, tokenDecimals } from "../chain";
import type { LiveConfig } from "../wallet";
import { type ApiMarket, toMarket, wholeTokens } from "./marketMapping";
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
  Market,
  MarketDetailResponse,
  MarketsResponse,
  NarrativesResponse,
  OracleResponse,
} from "./types";

// Single seam the pages read through. Index data comes from `api` when
// API_BASE_URL is set; without it the pages show sample data and say so.
// Narratives read /v1/narratives and are empty until the first CMI day is computed. Markets read /v1/markets once RPC_URL and FACTORY_ADDRESS are set. The oracle page reads
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
  if (!process.env.API_BASE_URL) return mockNarratives();
  const body = await fetchApi<
    Omit<NarrativesResponse, "methodologyVersion"> & {
      methodologyVersion: string | null;
    }
  >("/v1/narratives");
  if (!body) throw new Error("GET /v1/narratives returned 404");
  return { ...body, methodologyVersion: body.methodologyVersion ?? "1.0" };
}

// Markets are real only when the API and the chain are both configured; otherwise the page shows
// labelled sample data, same rule as the index pages.
async function liveMarkets() {
  const chain = marketChainConfig();
  if (!process.env.API_BASE_URL || !chain) return null;
  return { chain, decimals: await tokenDecimals(chain) };
}

export async function getMarkets(): Promise<MarketsResponse> {
  const live = await liveMarkets();
  if (!live) return { isSample: true, markets: mockMarkets() };
  const body = await fetchApi<{ markets: ApiMarket[] }>("/v1/markets");
  if (!body) throw new Error("GET /v1/markets returned 404");
  const now = new Date();
  return {
    isSample: false,
    markets: body.markets.map((m) => toMarket(m, live.decimals, now)),
  };
}

/** Real markets plus the chain settings the portfolio needs, or sample when markets are not live. */
export async function getPortfolioData(): Promise<
  | { isSample: true }
  | { isSample: false; markets: Market[]; config: LiveConfig }
> {
  const live = await liveMarkets();
  if (!live) return { isSample: true };
  const body = await fetchApi<{ markets: ApiMarket[] }>("/v1/markets");
  if (!body) throw new Error("GET /v1/markets returned 404");
  const now = new Date();
  return {
    isSample: false,
    markets: body.markets.map((m) => toMarket(m, live.decimals, now)),
    // The portfolio never uses the fee; it comes from the first market only to fill the type.
    config: liveConfig(live.chain, live.decimals, body.markets[0]?.feeBps ?? 0),
  };
}

const WINDOW_POINTS = 24;

export async function getMarketDetail(
  id: string,
): Promise<MarketDetailResponse | null> {
  const live = await liveMarkets();
  if (!live) {
    const d = mockMarketDetail(id);
    return d && { isSample: true, perAddressCapTokens: 1000, ...d };
  }
  const m = await fetchApi<ApiMarket>(`/v1/markets/${encodeURIComponent(id)}`);
  if (!m) return null;
  // Hourly prints of the market's index; the TWAP window is the last 24 of them.
  const detail = await getIndexDetail(
    m.indexLabel.replace(/^GRI-/, "").toLowerCase(),
  );
  return {
    isSample: false,
    market: toMarket(m, live.decimals, new Date()),
    windowPoints: detail?.history.points.slice(-WINDOW_POINTS) ?? [],
    windowEndAt: detail?.history.endAt ?? m.twapTo,
    perAddressCapTokens: Number(wholeTokens(m.betCap, live.decimals)),
    timeline: [
      { when: m.closeTime, what: "Closes" },
      { when: m.twapFrom, what: "TWAP starts" },
      { when: m.twapTo, what: "TWAP ends" },
      { when: m.settleableFrom, what: "Settle callable" },
    ],
    factory: live.chain.factory,
    live: {
      config: liveConfig(live.chain, live.decimals, m.feeBps),
      capBase: m.betCap,
      yesPoolBase: m.yesPool,
      noPoolBase: m.noPool,
    },
  };
}

/** null when this deployment has no oracle configured (503); the page then says so. */
export async function getOracle(): Promise<OracleResponse | null> {
  if (!process.env.API_BASE_URL) return mockOracle();
  return fetchApi<OracleResponse>("/v1/oracle", [404, 503]);
}
