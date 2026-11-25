"use client";

import { useId, useState } from "react";
import type { HistoryPoint } from "../lib/api/types";
import { at as nth } from "../lib/at";
import { formatUsd, formatUtc } from "../lib/format";
import styles from "./ChartPanel.module.css";
import { DataTable, SampleTag } from "./primitives";
import ui from "./ui.module.css";

const W = 800;
const H = 280;
const LEFT = 48;
const TOP = 16;
const BOTTOM = 28;
const RIGHT = 16;

type Props = {
  points: HistoryPoint[];
  endAt: string;
  caption: string;
  summary: string;
  thresholdMicroUsd?: string;
  isSample: boolean;
};

// Plot geometry may use floats; labels and table values come from the integer strings.
export function ChartPanel({
  points,
  endAt,
  caption,
  summary,
  thresholdMicroUsd,
  isSample,
}: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const n = points.length;
  const vals = points.map((p) => Number(p.value));
  const thr = thresholdMicroUsd ? Number(thresholdMicroUsd) : null;
  let lo = Math.min(...vals, ...(thr === null ? [] : [thr]));
  let hi = Math.max(...vals, ...(thr === null ? [] : [thr]));
  const pad = (hi - lo || 1) * 0.1;
  lo -= pad;
  hi += pad;
  const x = (i: number) => LEFT + (i / Math.max(1, n - 1)) * (W - LEFT - RIGHT);
  const y = (v: number) =>
    TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - BOTTOM);
  const endMs = Date.parse(endAt);
  const at = (i: number) =>
    new Date(endMs - (n - 1 - i) * 3_600_000).toISOString();

  const segments: { stale: boolean; pts: string[] }[] = [];
  points.forEach((p, i) => {
    const pt = `${x(i).toFixed(1)},${y(nth(vals, i)).toFixed(1)}`;
    const last = segments[segments.length - 1];
    if (!last || last.stale !== p.stale) {
      segments.push({
        stale: p.stale,
        pts: last ? [nth(last.pts, last.pts.length - 1), pt] : [pt],
      });
    } else {
      last.pts.push(pt);
    }
  });

  const move = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round(
      ((((clientX - r.left) / r.width) * W - LEFT) / (W - LEFT - RIGHT)) *
        (n - 1),
    );
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const cur = active === null ? null : points[active];
  const rows = [...points.keys()].slice(-48).reverse();

  return (
    <div>
      <div
        className={styles.chart}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard reading of the series, mirrors the table below
        tabIndex={0}
        role="img"
        aria-label="Line chart. Use left and right arrow keys to read values."
        onPointerMove={(e) => move(e.clientX, e.currentTarget)}
        onFocus={() => active === null && setActive(n - 1)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive((a) =>
            Math.max(
              0,
              Math.min(n - 1, (a ?? n - 1) + (e.key === "ArrowLeft" ? -1 : 1)),
            ),
          );
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          aria-hidden="true"
          fontFamily="monospace"
        >
          {[0, 1, 2, 3].map((k) => {
            const v = lo + ((hi - lo) * k) / 3;
            return (
              <g key={k}>
                <line
                  x1={LEFT}
                  x2={W - RIGHT}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#E8E4E4"
                />
                <text x={4} y={y(v) + 4} fill="#6B6767" fontSize={11}>
                  {formatUsd(String(Math.round(v)))}
                </text>
              </g>
            );
          })}
          {thr !== null && (
            <g>
              <line
                x1={LEFT}
                x2={W - RIGHT}
                y1={y(thr)}
                y2={y(thr)}
                stroke="#6D001A"
                strokeDasharray="2 4"
              />
              <text x={W - 150} y={y(thr) - 5} fill="#6D001A" fontSize={11}>
                threshold {formatUsd(String(thr))}
              </text>
            </g>
          )}
          {segments.map((s) => (
            <polyline
              key={s.pts[0]}
              points={s.pts.join(" ")}
              fill="none"
              stroke={s.stale ? "#6D001A" : "#0A0A0A"}
              strokeWidth={1.6}
              strokeDasharray={s.stale ? "5 4" : undefined}
            />
          ))}
          {active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={TOP}
                y2={H - BOTTOM}
                stroke="#6B6767"
              />
              <circle
                cx={x(active)}
                cy={y(nth(vals, active))}
                r={4}
                fill="#6D001A"
              />
            </g>
          )}
        </svg>
        <div
          className={styles.tip}
          role="status"
          style={{
            left: `${active === null ? 0 : Math.min((x(active) / W) * 100, 78)}%`,
          }}
        >
          {active !== null && cur
            ? `${formatUtc(at(active))} · ${formatUsd(cur.value, 4)}${cur.stale ? " ▲ stale" : ""}`
            : ""}
        </div>
      </div>
      <p style={{ marginTop: 10 }}>{summary}</p>
      <button
        type="button"
        className={`${ui.btn} ${ui.small}`}
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((s) => !s)}
      >
        {showTable ? "Hide table" : "View as table"}
      </button>
      <DataTable
        id={tableId}
        hidden={!showTable}
        caption={
          <>
            {caption} · latest 48 hours {isSample ? <SampleTag /> : null}
          </>
        }
      >
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">Value (USD)</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={at(i)}>
              <td>{formatUtc(at(i))}</td>
              <td>{formatUsd(nth(points, i).value, 4)}</td>
              <td>{nth(points, i).stale ? "▲ stale" : "● live"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
