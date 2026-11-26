"use client";

import { useState } from "react";
import type { NarrativeDay } from "../lib/api/types";
import { at } from "../lib/at";
import { NarrativeTreemap } from "./charts";
import { Notice } from "./primitives";
import ui from "./ui.module.css";

export function NarrativeExplorer({ days }: { days: NarrativeDay[] }) {
  // Opens on the newest day. Stepping replaces the native date picker.
  const [index, setIndex] = useState(days.length - 1);
  const day = at(days, index);
  const step = (label: string, to: number) => (
    <button
      type="button"
      className={`${ui.btn} ${ui.small}`}
      disabled={to < 0 || to >= days.length}
      onClick={() => setIndex(to)}
    >
      {label}
    </button>
  );
  return (
    <div>
      <p className="label">Date (UTC)</p>
      <div className={ui.stepper}>
        {step("Previous", index - 1)}
        <output aria-live="polite">{day.date}</output>
        {step("Next", index + 1)}
      </div>
      <div style={{ marginTop: 16 }} aria-live="polite">
        {day.bps ? (
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
