import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FxControls, RetryButton } from "../../components/DesignControls";
import { MarketCard } from "../../components/MarketCard";
import {
  DataTable,
  Notice,
  ProbabilityBar,
  SampleTag,
} from "../../components/primitives";
import { StatusChip } from "../../components/StatusChip";
import ui from "../../components/ui.module.css";
import { getMarkets } from "../../lib/api/client";
import type { ChipStatus } from "../../lib/api/types";

// Internal reference page for the design system. Not linked from the nav, not indexed, and
// not served in production.
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const SWATCHES = [
  ["white", "#FFFFFF"],
  ["ink", "#111111"],
  ["dim", "#666666"],
  ["burgundy", "#6D001A"],
  ["up", "#2E6E52"],
  ["down", "#A1500B"],
] as const;

const CHIPS: ChipStatus[] = [
  "LIVE",
  "STALE",
  "INSUFFICIENT_SOURCES",
  "OPEN",
  "CLOSED",
  "SETTLING",
  "SETTLED",
  "VOID",
  "NOT_LIVE",
];

const heading = { margin: "48px 0 16px" } as const;

export default async function DesignPage() {
  // Internal reference sheet: development only, production answers 404.
  if (process.env.NODE_ENV === "production") notFound();
  const { markets } = await getMarkets();
  const open = markets.find((m) => m.status === "OPEN");
  return (
    <div className={ui.page}>
      <p className="label">DESIGN SYSTEM · INTERNAL</p>
      <h1>
        Design<span style={{ color: "var(--em)" }}>.</span>
      </h1>

      <h3 style={heading}>Palette</h3>
      <div className={ui.grid4}>
        {SWATCHES.map(([name, hex]) => (
          <div key={name}>
            <span
              style={{
                display: "block",
                height: 56,
                border: "1px solid var(--ln)",
                background: hex,
              }}
            />
            <p className="label" style={{ margin: "8px 0 0" }}>
              {name} {hex}
            </p>
          </div>
        ))}
      </div>

      <h3 style={heading}>Type</h3>
      <h1 style={{ fontSize: 48 }}>
        Display · Cormorant 500<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <h2>
        Heading <i>italic accent.</i>
      </h2>
      <p style={{ color: "var(--tx)" }}>Body · Inter Tight 16 / 1.65</p>
      <p className="label">Label · mono 11 · tracking .18em</p>
      <p
        style={{
          font: "500 40px var(--font-mono), monospace",
          color: "var(--tx)",
        }}
      >
        2.4130 tabular
      </p>

      <h3 style={heading}>Buttons</h3>
      <div className={ui.cta} style={{ margin: 0 }}>
        <button type="button" className={`${ui.btn} ${ui.primary}`}>
          Primary
        </button>
        <button type="button" className={ui.btn}>
          Secondary
        </button>
        <button type="button" className={`${ui.btn} ${ui.primary}`} disabled>
          Disabled
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${ui.loading}`}
        >
          Loading
        </button>
      </div>

      <h3 style={heading}>Input</h3>
      <label className="label" htmlFor="design-input">
        Amount (USDG)
      </label>
      <br />
      <input
        className={ui.input}
        id="design-input"
        inputMode="decimal"
        placeholder="0.00"
      />

      <h3 style={heading}>Status chips</h3>
      <div className={ui.cta} style={{ margin: 0 }}>
        {CHIPS.map((c) => (
          <StatusChip key={c} status={c} />
        ))}
      </div>

      <h3 style={heading}>Table</h3>
      <DataTable
        caption={
          <>
            Sample table <SampleTag />
          </>
        }
      >
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Price</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Source 01</td>
            <td>$2.38</td>
            <td>included</td>
          </tr>
          <tr>
            <td>Source 02</td>
            <td>$3.90</td>
            <td>○ excluded</td>
          </tr>
        </tbody>
      </DataTable>

      <h3 style={heading}>Probability bar and market card</h3>
      <ProbabilityBar yes={62n} no={38n} />
      {open && <MarketCard market={{ ...open, status: "NOT_LIVE" }} />}

      <h3 style={heading}>Stale banner</h3>
      <Notice>▲ STALE · Last print 01:00 UTC. Showing last value.</Notice>

      <h3 style={heading}>Empty and error</h3>
      <div className={ui.grid2}>
        <div className={ui.card}>
          <p className="label">EMPTY</p>
          No positions yet. Connect a wallet to see yours.
        </div>
        <div className={ui.card} style={{ borderColor: "var(--dn)" }}>
          <p className="label">■ ERROR</p>
          Could not load data. <RetryButton />
        </div>
      </div>

      <h3 style={heading}>Effects</h3>
      <p>Background intensity for review. Applies to the whole site.</p>
      <FxControls />

      <h3 style={heading}>Skeleton</h3>
      <div className={ui.card}>
        <div className={ui.skeleton} style={{ width: "40%" }} />
        <div className={ui.skeleton} />
        <div className={ui.skeleton} style={{ width: "70%" }} />
      </div>
    </div>
  );
}
