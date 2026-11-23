"use client";

import { useState } from "react";
import type { HistoryPoint } from "../lib/api/types";
import { at } from "../lib/at";
import { formatUsd } from "../lib/format";
import { ChartPanel } from "./ChartPanel";
import ui from "./ui.module.css";

const RANGES = [
  ["24H", 24],
  ["7D", 168],
  ["30D", 720],
  ["ALL", 720],
] as const;

export function GpuHistory({
  indexId,
  points,
  endAt,
}: {
  indexId: string;
  points: HistoryPoint[];
  endAt: string | null;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("7D");
  if (endAt === null || points.length === 0) {
    return <p className="label">No published history yet.</p>;
  }
  const count = RANGES.find(([r]) => r === range)?.[1] ?? 168;
  const slice = points.slice(-count);
  const stale = slice.filter((p) => p.stale).length;
  const summary = `${range}: from ${formatUsd(at(slice, 0).value)} to ${formatUsd(at(slice, slice.length - 1).value)} USD/hr${
    stale ? `; ${stale} stale hours shown dashed` : ""
  }.`;
  return (
    <div>
      <div className={ui.tabs} role="toolbar" aria-label="Range">
        {RANGES.map(([r]) => (
          <button
            key={r}
            type="button"
            className={`${ui.btn} ${ui.small} ${r === range ? ui.primary : ""}`}
            aria-pressed={r === range}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <ChartPanel
        key={range}
        points={slice}
        endAt={endAt}
        caption={`${indexId} · ${range}`}
        summary={summary}
      />
    </div>
  );
}
