import { changeBps, isoSeconds, meanHalfUp } from "./money.ts";
import type { HistoryPoint, IndexSnapshot, IndexStatus } from "./types.ts";

export const HOUR_MS = 3_600_000;
export const HISTORY_HOURS = 720;
export const MIN_VALID_SOURCES = 5;
const TWAP_HOURS = 24;
const TWAP_MAX_STALE_HOURS = 6;

export type HourRow = {
  hour: Date;
  valueMicro: bigint | null;
  validSources: number;
  status: IndexStatus;
};

export type Point = { value: bigint; stale: boolean };

export type Series = { endAt: Date | null; points: Point[] };

// One point per hour up to the latest stored hour. An hour without a value repeats the last
// known value and is flagged stale. Hours before the first value are left out, so the points
// always end at `endAt` and are consecutive hours.
export function buildSeries(
  rows: HourRow[],
  priorValue: bigint | null,
): Series {
  const last = rows.at(-1);
  const first = rows[0];
  if (!last || !first) return { endAt: null, points: [] };
  const byHour = new Map(rows.map((row) => [row.hour.getTime(), row]));
  const end = last.hour.getTime();
  const start = Math.max(
    first.hour.getTime(),
    end - (HISTORY_HOURS - 1) * HOUR_MS,
  );
  let carried = priorValue;
  const points: Point[] = [];
  for (let at = start; at <= end; at += HOUR_MS) {
    const value = byHour.get(at)?.valueMicro ?? null;
    if (value !== null) {
      carried = value;
      points.push({ value, stale: false });
    } else if (carried !== null) {
      points.push({ value: carried, stale: true });
    }
  }
  return { endAt: last.hour, points };
}

export function toHistoryPoints(points: Point[]): HistoryPoint[] {
  return points.map((point) => ({
    value: String(point.value),
    stale: point.stale,
  }));
}

function changeOver(points: Point[], hours: number): number | null {
  const latest = points.at(-1);
  const earlier = points[points.length - 1 - hours];
  if (!latest || !earlier) return null;
  return changeBps(latest.value, earlier.value);
}

// Same shape as the prototype: the last 168 hours, one point every 12 hours.
function trend7d(points: Point[]): string[] {
  return points
    .slice(-168)
    .filter((_, index) => index % 12 === 11)
    .map((point) => String(point.value));
}

export function buildSnapshot(args: {
  slug: string;
  gpuClass: string;
  methodologyVersion: string;
  latest: HourRow | undefined;
  series: Series;
}): IndexSnapshot {
  const { slug, gpuClass, methodologyVersion, latest, series } = args;
  const lastPoint = series.points.at(-1);
  return {
    indexId: `GRI-${slug.toUpperCase()}`,
    gpuClass,
    slug,
    valueMicroUsd: lastPoint ? String(lastPoint.value) : null,
    change24hBps: changeOver(series.points, 24),
    change7dBps: changeOver(series.points, 168),
    validSources: latest?.validSources ?? 0,
    minValidSources: MIN_VALID_SOURCES,
    updatedAt: lastPublishedAt(series),
    status: latest?.status ?? "STALE",
    methodologyVersion,
    trend7d: trend7d(series.points),
  };
}

// The hour of the most recent point that holds a real value, not a carried-forward one.
function lastPublishedAt(series: Series): string | null {
  if (!series.endAt) return null;
  let staleTail = 0;
  for (let i = series.points.length - 1; i >= 0 && series.points[i]?.stale; i--)
    staleTail++;
  if (staleTail === series.points.length) return null;
  return isoSeconds(new Date(series.endAt.getTime() - staleTail * HOUR_MS));
}

// Market-style 24 hour TWAP: stale hours are skipped, and more than 6 of them means no value.
export function twap24h(points: Point[]): bigint | null {
  const window = points.slice(-TWAP_HOURS);
  const live = window.filter((point) => !point.stale);
  if (live.length === 0 || window.length - live.length > TWAP_MAX_STALE_HOURS)
    return null;
  return meanHalfUp(live.map((point) => point.value));
}
