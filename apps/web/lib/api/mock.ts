// Deterministic sample data for the frontend stage. Generators use floats only
// to shape fake curves; every value leaves this file as an integer string.
import { at } from "../at";
import { rng } from "../rng";
import {
  type HistoryPoint,
  type IndexDetailResponse,
  type IndexSnapshot,
  type IndexStatus,
  type Market,
  NARRATIVES,
  type Narrative,
  type NarrativeDay,
  type NarrativesResponse,
  type OracleResponse,
  type PostRow,
  type SourceRow,
} from "./types";

export const METHODOLOGY_VERSION = "1.0";
const HOUR = 3_600_000;
const END = Date.UTC(2026, 10, 21, 8);

function walk(seed: number, start: number, n: number, vol: number): number[] {
  const r = rng(seed);
  let v = start;
  return Array.from({ length: n }, () => {
    v *= 1 + (r() - 0.5) * vol;
    return v;
  });
}

type Base = {
  id: string;
  gpu: string;
  slug: string;
  micro: number;
  c24: number;
  c7: number;
  valid: number;
  reporting: number;
  status: IndexStatus;
  vol: number;
};

const BASES: Base[] = [
  {
    id: "GRI-H100",
    gpu: "H100",
    slug: "h100",
    micro: 2_410_000,
    c24: 60,
    c7: 480,
    valid: 6,
    reporting: 7,
    status: "LIVE",
    vol: 0.006,
  },
  {
    id: "GRI-H200",
    gpu: "H200",
    slug: "h200",
    micro: 3_180_000,
    c24: -40,
    c7: -190,
    valid: 6,
    reporting: 7,
    status: "LIVE",
    vol: 0.006,
  },
  {
    id: "GRI-B200",
    gpu: "B200",
    slug: "b200",
    micro: 5_920_000,
    c24: 0,
    c7: 220,
    valid: 5,
    reporting: 6,
    status: "STALE",
    vol: 0.006,
  },
  {
    id: "GRI-A100",
    gpu: "A100",
    slug: "a100",
    micro: 1_270_000,
    c24: -20,
    c7: -310,
    valid: 6,
    reporting: 7,
    status: "LIVE",
    vol: 0.006,
  },
  {
    id: "GRI-4090",
    gpu: "RTX 4090",
    slug: "4090",
    micro: 390_000,
    c24: 0,
    c7: 0,
    valid: 3,
    reporting: 4,
    status: "INSUFFICIENT_SOURCES",
    vol: 0.006,
  },
];

const STALE_TAIL = 7;
const INSUFFICIENT_TRIM = 120;

function history(
  b: Base,
  i: number,
): { endAt: string; points: HistoryPoint[] } {
  const raw = walk(20 + i, b.micro, 720, b.vol);
  const k = b.micro / at(raw, 719);
  let values = raw.map((v) => Math.round(v * k));
  let stale = values.map(() => false);
  if (b.status === "STALE") {
    for (let j = 720 - STALE_TAIL; j < 720; j++) {
      values[j] = at(values, 720 - STALE_TAIL - 1);
      stale[j] = true;
    }
  }
  let end = END;
  if (b.status === "INSUFFICIENT_SOURCES") {
    values = values.slice(0, 720 - INSUFFICIENT_TRIM);
    stale = stale.slice(0, 720 - INSUFFICIENT_TRIM);
    end = Date.UTC(2026, 10, 20, 14);
  }
  return {
    endAt: new Date(end).toISOString(),
    points: values.map((v, j) => ({
      value: String(v),
      stale: stale[j] === true,
    })),
  };
}

function snapshot(b: Base, i: number): IndexSnapshot {
  const h = history(b, i);
  const recent = h.points.slice(-168);
  return {
    indexId: b.id,
    gpuClass: b.gpu,
    slug: b.slug,
    valueMicroUsd: String(b.micro),
    change24hBps: b.c24,
    change7dBps: b.c7,
    validSources: b.valid,
    minValidSources: 5,
    updatedAt: new Date(
      Date.parse(h.endAt) - (b.status === "STALE" ? STALE_TAIL * HOUR : 0),
    )
      .toISOString()
      .slice(0, 19)
      .concat("Z"),
    status: b.status,
    methodologyVersion: METHODOLOGY_VERSION,
    trend7d: recent.filter((_, j) => j % 12 === 11).map((p) => p.value),
  };
}

export function mockIndexes(): IndexSnapshot[] {
  return BASES.map(snapshot);
}

function medianOf(values: bigint[]): bigint {
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const m = s.length >> 1;
  return s.length % 2 ? at(s, m) : (at(s, m - 1) + at(s, m) + 1n) / 2n;
}

export function mockIndexDetail(slug: string): IndexDetailResponse | null {
  const i = BASES.findIndex((b) => b.slug === slug);
  const b = BASES[i];
  if (!b) return null;
  const h = history(b, i);
  const r = rng(40 + i);
  const sources: SourceRow[] = Array.from({ length: b.reporting }, (_, s) => {
    const excluded = s >= b.valid;
    const price = b.micro * (excluded ? 1.22 : 1 + (r() - 0.5) * 0.05);
    const fetched =
      excluded && b.reporting === 4
        ? "2026-11-20T14:00"
        : `2026-11-21T07:5${s}`;
    return {
      name: `Source 0${s + 1}`,
      priceMicroUsd: String(Math.round(price)),
      included: !excluded,
      fetchedAt: `${fetched}:00Z`,
    };
  });
  const published = b.status !== "INSUFFICIENT_SOURCES";
  const included = sources
    .filter((s) => s.included)
    .map((s) => BigInt(s.priceMicroUsd));
  const day = h.points.slice(-24).filter((p) => !p.stale);
  const twap = day.reduce((a, p) => a + BigInt(p.value), 0n);
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    isSample: true,
    index: snapshot(b, i),
    history: h,
    reportingSources: b.reporting,
    sources,
    medianMicroUsd: included.length ? String(medianOf(included)) : null,
    twap24hMicroUsd:
      published && day.length
        ? String((twap * 2n + BigInt(day.length)) / (BigInt(day.length) * 2n))
        : null,
  };
}

const NARRATIVE_BASE = [3100, 2500, 1750, 1500, 1150];
const DAY0 = Date.UTC(2026, 9, 22);
const ZERO_DAY = 10;

// Exact largest-remainder rounding so shares always sum to 10,000.
function shares(day: number): Record<Narrative, number> {
  const r = rng(day * 7 + 1);
  const raw = NARRATIVE_BASE.map((b) =>
    BigInt(Math.round(b * (1 + (r() - 0.5) * 0.3) * 1000)),
  );
  const total = raw.reduce((a, b) => a + b, 0n);
  const floor = raw.map((x) => (x * 10000n) / total);
  const left = 10000 - Number(floor.reduce((a, b) => a + b, 0n));
  raw
    .map((x, i) => ({ i, rem: (x * 10000n) % total }))
    .sort((a, b) => (a.rem < b.rem ? 1 : a.rem > b.rem ? -1 : 0))
    .slice(0, left)
    .forEach(({ i }) => {
      floor[i] = at(floor, i) + 1n;
    });
  return Object.fromEntries(
    NARRATIVES.map((n, i) => [n, Number(floor[i])]),
  ) as Record<Narrative, number>;
}

export function mockNarratives(): NarrativesResponse {
  const days: NarrativeDay[] = Array.from({ length: 30 }, (_, d) => ({
    date: new Date(DAY0 + d * 864e5).toISOString().slice(0, 10),
    stale: d === ZERO_DAY,
    bps: d === ZERO_DAY ? null : shares(d),
  }));
  const platforms = ["X", "Farcaster", "Bluesky"] as const;
  const r = rng(77);
  const hex = (n: number) =>
    Math.floor(r() * n)
      .toString(16)
      .padStart(4, "0");
  const posts = NARRATIVES.slice(0, 4).map((narrative, k) => ({
    narrative,
    rows: Array.from(
      { length: 3 },
      (_, i): PostRow => ({
        platform: at(platforms, (i + k) % 3),
        postId: `${hex(65535)}${hex(65535)}…${hex(65535)}`,
        label: narrative,
        botScore: (0.02 + r() * 0.3).toFixed(2),
        modelHash: `${hex(65535)}${hex(65535)}`,
        weightShareBps: Math.floor(200 + r() * 700),
      }),
    ),
  }));
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    isSample: true,
    days,
    posts,
  };
}

const MARKETS: Market[] = [
  {
    id: "gri-h100-2026-11-28",
    question: "GRI-H100 above $2.50 on Friday 2026-11-28?",
    thresholdMicroUsd: "2500000",
    yesPool: "6200",
    noPool: "3800",
    closesAt: "2026-11-26T00:00:00Z",
    status: "OPEN",
    group: "active",
  },
  {
    id: "gri-h100-2026-11-21-a",
    question: "GRI-H100 above $2.45 on Friday 2026-11-21?",
    thresholdMicroUsd: "2450000",
    yesPool: "7100",
    noPool: "2900",
    closesAt: "2026-11-19T00:00:00Z",
    status: "CLOSED",
    group: "active",
  },
  {
    id: "gri-h100-2026-11-21-b",
    question: "GRI-H100 above $2.40 on Friday 2026-11-21?",
    thresholdMicroUsd: "2400000",
    yesPool: "5400",
    noPool: "4600",
    closesAt: "2026-11-19T00:00:00Z",
    status: "SETTLING",
    group: "active",
  },
  {
    id: "gri-h100-2026-12-05",
    question: "GRI-H100 above $2.55 on Friday 2026-12-05?",
    thresholdMicroUsd: "2550000",
    yesPool: "0",
    noPool: "0",
    closesAt: "2026-12-03T00:00:00Z",
    status: "NOT_LIVE",
    group: "upcoming",
  },
  {
    id: "gri-h100-2026-11-14",
    question: "GRI-H100 above $2.30 on Friday 2026-11-14?",
    thresholdMicroUsd: "2300000",
    yesPool: "6000",
    noPool: "4000",
    closesAt: "2026-11-12T00:00:00Z",
    status: "SETTLED",
    group: "settled",
    winner: "YES",
  },
  {
    id: "gri-h100-2026-11-07",
    question: "GRI-H100 above $2.60 on Friday 2026-11-07?",
    thresholdMicroUsd: "2600000",
    yesPool: "2500",
    noPool: "7500",
    closesAt: "2026-11-05T00:00:00Z",
    status: "SETTLED",
    group: "settled",
    winner: "NO",
  },
  {
    id: "gri-h100-2026-10-31",
    question: "GRI-H100 above $2.35 on Friday 2026-10-31?",
    thresholdMicroUsd: "2350000",
    yesPool: "0",
    noPool: "3000",
    closesAt: "2026-10-29T00:00:00Z",
    status: "VOID",
    group: "void",
  },
];

export const mockMarkets = (): Market[] => MARKETS;

export function mockMarketDetail(id: string) {
  const market = MARKETS.find((m) => m.id === id);
  if (!market) return null;
  const h = history(at(BASES, 0), 0);
  return {
    market,
    windowPoints: h.points.slice(-24).map((p) => ({ ...p, stale: false })),
    windowEndAt: h.endAt,
  };
}

export function mockOracle(): OracleResponse {
  const r = rng(91);
  const toleranceBps = 100;
  const operators = ["0xa11c...e001", "0xb0b0...e002", "0xca01...e003"];
  const byValue = (a: bigint, b: bigint) => (a < b ? -1 : 1);
  const slots = Array.from({ length: 8 }, (_, i) => {
    const m = 2_410_000 * (1 + (r() - 0.5) * 0.008);
    const v = operators.map(() => Math.round(m * (1 + (r() - 0.5) * 0.006)));
    if (i === 2) v[2] = Math.round(m * 1.011);
    const med = Number(medianOf(v.map(BigInt).sort(byValue)));
    const values = v.map((x, k) => {
      const gap = Math.round(((x - med) * 10000) / med);
      return {
        operator: operators[k] as string,
        valueMicroUsd: String(x),
        kept: Math.abs(gap) <= toleranceBps,
        gapBps: Math.abs(gap),
        deviationBps: gap,
      };
    });
    const kept = values
      .filter((x) => x.kept)
      .map((x) => BigInt(x.valueMicroUsd))
      .sort(byValue);
    return {
      indexId: "GRI-H100",
      indexLabel: "GRI-H100",
      slot: `2026-11-21T0${7 - i}:00:00Z`,
      values,
      medianMicroUsd: String(med),
      maxGapBps: Math.max(...values.map((x) => x.gapBps)),
      finalizedValueMicroUsd: String(medianOf(kept)),
      keptCount: kept.length,
    };
  });
  return {
    isSample: true,
    toleranceBps,
    operators: operators.map((address) => ({
      address,
      active: true,
      lastSignedAt: "2026-11-21T08:00:00Z",
      reports24h: 24,
    })),
    slots,
    rejections: [
      {
        indexLabel: "GRI-H100",
        slot: "2026-11-21T04:00:00Z",
        operator: operators[1] as string,
        reason: "window closed",
        at: "2026-11-21T08:03:00Z",
      },
      {
        indexLabel: "GRI-H100",
        slot: "2026-11-21T02:00:00Z",
        operator: operators[0] as string,
        reason: "nonce used",
        at: "2026-11-21T06:01:00Z",
      },
    ],
  };
}
