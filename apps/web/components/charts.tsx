import type { Narrative, NarrativeDay, SourceRow } from "../lib/api/types";
import { at } from "../lib/at";
import { formatInt, formatUsd } from "../lib/format";
import { narrativeNames } from "../lib/narrativeNames";

// The api decides which narratives exist. Colours go by position, OTHER is always the lightest.
const PALETTE: { bg: string; text: string }[] = [
  { bg: "#6D001A", text: "#FFFFFF" },
  { bg: "#0A0A0A", text: "#FFFFFF" },
  { bg: "#6B6767", text: "#FFFFFF" },
  { bg: "#A9A4A4", text: "#0A0A0A" },
  { bg: "#9B3B52", text: "#FFFFFF" },
  { bg: "#3A3636", text: "#FFFFFF" },
  { bg: "#C9A0AA", text: "#0A0A0A" },
];
const OTHER_STYLE = { bg: "#D6D1D1", text: "#0A0A0A" };

function share(bps: Record<Narrative, number>, name: Narrative): number {
  return bps[name] ?? 0;
}

function narrativeStyle(names: Narrative[], name: Narrative) {
  if (name === "OTHER") return OTHER_STYLE;
  return at(PALETTE, names.indexOf(name) % PALETTE.length);
}

export function Sparkline({
  values,
  w = 90,
  h = 22,
}: {
  values: string[];
  w?: number;
  h?: number;
}) {
  if (values.length < 2) return <span>n/a</span>;
  const nums = values.map(Number);
  const lo = Math.min(...nums);
  const span = Math.max(...nums) - lo || 1;
  const pts = nums
    .map(
      (v, i) =>
        `${((i / (nums.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / span) * h).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`7-day trend, from ${formatUsd(at(values, 0))} to ${formatUsd(at(values, values.length - 1))} USD`}
    >
      <polyline points={pts} fill="none" stroke="#0A0A0A" strokeWidth={1.5} />
    </svg>
  );
}

export function SourceSpread({
  sources,
  medianMicroUsd,
}: {
  sources: SourceRow[];
  medianMicroUsd: string | null;
}) {
  if (sources.length === 0) {
    return <p className="label">No source prices for this hour.</p>;
  }
  const prices = sources.map((s) => Number(s.priceMicroUsd));
  const lo = Math.min(...prices) * 0.97;
  const hi = Math.max(...prices) * 1.03;
  const x = (p: number) => 30 + ((p - lo) / (hi - lo)) * 740;
  const med = medianMicroUsd === null ? null : Number(medianMicroUsd);
  return (
    <svg
      viewBox="0 0 800 110"
      width="100%"
      role="img"
      aria-label={`Source prices from ${formatUsd(String(Math.min(...prices)))} to ${formatUsd(String(Math.max(...prices)))}${
        med === null ? "" : `; median ${formatUsd(String(med))}`
      }`}
      fontFamily="monospace"
    >
      <line x1={30} x2={770} y1={70} y2={70} stroke="#E8E4E4" />
      {med !== null && (
        <g>
          <line x1={x(med)} x2={x(med)} y1={20} y2={90} stroke="#6D001A" />
          <text x={x(med) + 6} y={28} fill="#6D001A" fontSize={11}>
            median {formatUsd(String(med))}
          </text>
        </g>
      )}
      {sources.map((s, j) => {
        const cy = 50 + (j % 3) * 14;
        const p = Number(s.priceMicroUsd);
        return (
          <g key={s.name}>
            <circle
              cx={x(p)}
              cy={cy}
              r={6}
              fill={s.included ? "#0A0A0A" : "none"}
              stroke={s.included ? "#0A0A0A" : "#B45309"}
              strokeWidth={2}
            >
              <title>{`${s.name} ${formatUsd(s.priceMicroUsd)}${s.included ? "" : " excluded"}`}</title>
            </circle>
            {!s.included && (
              <text x={x(p) + 10} y={cy + 4} fill="#B45309" fontSize={11}>
                excluded
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function NarrativeBar({ bps }: { bps: Record<Narrative, number> }) {
  const NARRATIVES = narrativeNames(bps);
  return (
    <div
      data-bar
      role="img"
      aria-label={`CMI shares: ${NARRATIVES.map((n) => `${n} ${share(bps, n)} bps`).join(", ")}`}
      style={{ display: "flex", height: 64, border: "1px solid var(--ln)" }}
    >
      {NARRATIVES.map((n) => (
        <div
          key={n}
          style={{
            width: `${share(bps, n) / 100}%`,
            background: narrativeStyle(NARRATIVES, n).bg,
            color: narrativeStyle(NARRATIVES, n).text,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 10px",
            fontSize: 11,
            fontWeight: 500,
            overflow: "hidden",
            borderRight: "1px solid var(--bg)",
          }}
        >
          <span>{n}</span>
          <span>{formatInt(share(bps, n))}</span>
        </div>
      ))}
    </div>
  );
}

export function NarrativeTreemap({ bps }: { bps: Record<Narrative, number> }) {
  const NARRATIVES = narrativeNames(bps);
  const order = [...NARRATIVES].sort((a, b) => share(bps, b) - share(bps, a));
  const rows = [order.slice(0, 2), order.slice(2)].filter((r) => r.length > 0);
  const sum = (r: Narrative[]) => r.reduce((a, n) => a + share(bps, n), 0);
  return (
    <div
      role="img"
      aria-label={NARRATIVES.map((n) => `${n} ${share(bps, n)} bps`).join(", ")}
    >
      {rows.map((r) => (
        <div key={r[0]} style={{ display: "flex", height: sum(r) / 45 }}>
          {r.map((n) => (
            <div
              key={n}
              style={{
                flex: `${share(bps, n)} 1 0`,
                background: narrativeStyle(NARRATIVES, n).bg,
                color: narrativeStyle(NARRATIVES, n).text,
                padding: 10,
                minWidth: 0,
                overflow: "hidden",
                overflowWrap: "anywhere",
                border: "1px solid var(--bg)",
              }}
            >
              <b>{n}</b>
              <br />
              {formatInt(share(bps, n))} bps
            </div>
          ))}
        </div>
      ))}
      <p className="label" style={{ marginTop: 8 }}>
        Total {formatInt(NARRATIVES.reduce((a, n) => a + share(bps, n), 0))} bps
      </p>
    </div>
  );
}

export function NarrativeArea({ days }: { days: NarrativeDay[] }) {
  const W = 800;
  const H = 240;
  const first = days.find((d) => d.bps)?.bps;
  if (!first) return null;
  // The x axis divides by days - 1, so a single day cannot draw an area.
  if (days.length < 2)
    return <p className="label">A trend needs at least two days.</p>;
  const NARRATIVES = narrativeNames(first);
  // A stale day has no value; carry the previous day so the area stays continuous.
  let prev = first;
  const filled = days.map((d) => {
    if (d.bps) prev = d.bps;
    return prev;
  });
  const acc = NARRATIVES.map((_, j) =>
    filled.map((b) =>
      NARRATIVES.slice(0, j + 1).reduce((s, n) => s + (b[n] ?? 0), 0),
    ),
  );
  const px = (i: number) => ((i / (days.length - 1)) * W).toFixed(0);
  const py = (v: number) => (H - (v / 10000) * H).toFixed(1);
  const staleAt = days.map((d, i) => (d.stale ? i : -1)).filter((i) => i >= 0);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="30-day stacked area of CMI shares. Dashed lines mark days with no published value."
    >
      {[...NARRATIVES.keys()].reverse().map((j) => {
        const name = at(NARRATIVES, j);
        const upper = at(acc, j);
        const top = upper.map((v, i) => `${px(i)},${py(v)}`);
        const bottom = (j ? at(acc, j - 1) : upper.map(() => 0))
          .map((v, i) => `${px(i)},${py(v)}`)
          .reverse();
        return (
          <polygon
            key={name}
            points={[...top, ...bottom].join(" ")}
            fill={narrativeStyle(NARRATIVES, name).bg}
          />
        );
      })}
      {staleAt.map((i) => (
        <line
          key={i}
          x1={px(i)}
          x2={px(i)}
          y1={0}
          y2={H}
          stroke="#E8E4E4"
          strokeDasharray="4 4"
        />
      ))}
    </svg>
  );
}
