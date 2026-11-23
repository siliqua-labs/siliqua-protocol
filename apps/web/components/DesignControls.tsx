"use client";

import { type FxLevel, useAppState } from "./AppState";
import ui from "./ui.module.css";

const LEVELS: FxLevel[] = ["Subtle", "Default", "Bold"];

export function FxControls() {
  const { fx, setFx } = useAppState();
  return (
    <div className={ui.tabs} role="toolbar" aria-label="Effects intensity">
      {LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          className={`${ui.btn} ${ui.small} ${l === fx ? ui.primary : ""}`}
          aria-pressed={l === fx}
          onClick={() => setFx(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function RetryButton() {
  const { toast } = useAppState();
  return (
    <button
      type="button"
      className={`${ui.btn} ${ui.small}`}
      onClick={() => toast("Retry (mock)")}
    >
      Retry
    </button>
  );
}
