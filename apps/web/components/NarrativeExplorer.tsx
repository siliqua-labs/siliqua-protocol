"use client";

import { useState } from "react";
import type { NarrativeDay } from "../lib/api/types";
import { at } from "../lib/at";
import { NarrativeTreemap } from "./charts";
import { Notice } from "./primitives";

export function NarrativeExplorer({ days }: { days: NarrativeDay[] }) {
  const first = at(days, 0).date;
  const last = at(days, days.length - 1).date;
  const [date, setDate] = useState(last);
  const day = days.find((d) => d.date === date);
  return (
    <div>
      <label className="label" htmlFor="cmi-date">
        Date (UTC)
      </label>
      <br />
      <input
        id="cmi-date"
        type="date"
        min={first}
        max={last}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--ln)",
          color: "var(--tx)",
          font: "16px var(--font-mono), monospace",
          padding: "12px 14px",
          maxWidth: 280,
        }}
      />
      <div style={{ marginTop: 16 }} aria-live="polite">
        {!day ? (
          <Notice>No CMI for this date.</Notice>
        ) : day.bps ? (
          <NarrativeTreemap bps={day.bps} />
        ) : (
          <Notice>
            ▲ STALE · Total raw weight was zero on this day. No CMI is published
            for it.
          </Notice>
        )}
      </div>
    </div>
  );
}
