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

export function MarketList({
  markets,
  isSample,
}: {
  markets: Market[];
  isSample: boolean;
}) {
  const [group, setGroup] = useState<MarketGroup>("active");
  const shown = markets.filter((m) => m.group === group);
  // Live markets open as soon as the keeper creates them, so none is ever upcoming.
  const tabs = isSample ? TABS : TABS.filter(([g]) => g !== "upcoming");
  return (
    <div>
      <div
        className={ui.tabs}
        role="toolbar"
        aria-label="Market state"
        style={{ marginTop: 32 }}
      >
        {tabs.map(([g, label]) => (
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
          shown.map((m) => (
            <MarketCard key={m.id} market={m} isSample={isSample} />
          ))
        ) : (
          <div className={ui.card}>No markets in this state.</div>
        )}
      </div>
    </div>
  );
}
