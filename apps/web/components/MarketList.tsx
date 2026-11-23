"use client";

import { useState } from "react";
import type { Market, MarketGroup } from "../lib/api/types";
import { MarketCard } from "./MarketCard";
import ui from "./ui.module.css";

const TABS: [MarketGroup, string][] = [
  ["active", "Active"],
  ["upcoming", "Upcoming"],
  ["settled", "Settled"],
  ["void", "Void"],
];

export function MarketList({ markets }: { markets: Market[] }) {
  const [group, setGroup] = useState<MarketGroup>("active");
  const shown = markets.filter((m) => m.group === group);
  return (
    <div>
      <div
        className={ui.tabs}
        role="toolbar"
        aria-label="Market state"
        style={{ marginTop: 32 }}
      >
        {TABS.map(([g, label]) => (
          <button
            key={g}
            type="button"
            className={`${ui.btn} ${ui.small} ${g === group ? ui.primary : ""}`}
            aria-pressed={g === group}
            onClick={() => setGroup(g)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={ui.grid2}>
        {shown.length ? (
          shown.map((m) => <MarketCard key={m.id} market={m} />)
        ) : (
          <div className={ui.card}>No markets in this state.</div>
        )}
      </div>
    </div>
  );
}
