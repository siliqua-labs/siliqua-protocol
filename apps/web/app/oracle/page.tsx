import type { Metadata } from "next";
import { DataTable, Notice, SampleTag } from "../../components/primitives";
import { StatusChip } from "../../components/StatusChip";
import ui from "../../components/ui.module.css";
import { getOracle } from "../../lib/api/client";
import { formatBpsPercent, formatUsd, formatUtc } from "../../lib/format";

export const metadata: Metadata = { title: "Oracle" };

const W = 800;
const H = 220;
const COLORS = ["#0A0A0A", "#6D001A", "#6B6767"];

export default async function OraclePage() {
  const o = await getOracle();
  // Spread values are bps of deviation from the median; the axis spans +/-1.6x tolerance.
  const span = o.toleranceBps * 1.6;
  const y = (bps: number) => H / 2 - (bps / span) * (H / 2);
  const tol = `${formatBpsPercent(o.toleranceBps).replace(".00", "")}`;
  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> ORACLE
      </p>
      <h1>
        Who signs the print<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        <StatusChip status="NOT_LIVE" /> <SampleTag />
      </p>
      <Notice>
        <span className="label">v1 trust model</span>
        <ul>
          <li>Three operators, all from the Siliqua team. Not independent.</li>
          <li>
            Each operator signs its own value. Values more than {tol} from the
            median are dropped, and at least 2 must remain.
          </li>
          <li>No stake and no slashing in v1.</li>
          <li>The operator allowlist is managed by a multisig.</li>
          <li>
            Operators may not bet in markets they report on, and their wallets
            are announced.
          </li>
        </ul>
      </Notice>

      <div style={{ marginTop: 24 }}>
        <DataTable
          caption={
            <>
              Operators <SampleTag />
            </>
          }
        >
          <thead>
            <tr>
              <th scope="col">Operator</th>
              <th scope="col">Wallet</th>
              <th scope="col">Status</th>
              <th scope="col">Last signed report</th>
              <th scope="col">Reports, 24h</th>
            </tr>
          </thead>
          <tbody>
            {o.operators.map((op) => (
              <tr key={op.name}>
                <td>{op.name}</td>
                <td>not announced</td>
                <td>
                  <StatusChip status="NOT_LIVE" />
                </td>
                <td>{formatUtc(op.lastSignedAt)}</td>
                <td>{op.reports24h}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div style={{ marginTop: 24 }}>
        <DataTable
          caption={
            <>
              Recent reports <SampleTag />
            </>
          }
        >
          <thead>
            <tr>
              <th scope="col">Index</th>
              <th scope="col">Hour</th>
              <th scope="col">Op. A</th>
              <th scope="col">Op. B</th>
              <th scope="col">Op. C</th>
              <th scope="col">Max gap vs median</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {o.reports.map((r) => (
              <tr key={r.hour}>
                <td>{r.indexId}</td>
                <td>{formatUtc(r.hour)}</td>
                {r.values.map((v, k) => (
                  <td key={`${r.hour}-${o.operators[k]?.name}`}>
                    {formatUsd(v, 4)}
                  </td>
                ))}
                <td>{formatBpsPercent(r.maxGapBps)}</td>
                <td>
                  {r.result === "accepted"
                    ? "● accepted"
                    : `■ rejected · ${r.reason}`}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <h3 className={ui.h3}>Operator spread, 24h</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Operator deviation from the median stays within about 0.25 percent. Contract tolerance is ${tol}.`}
        fontFamily="monospace"
      >
        {[o.toleranceBps, -o.toleranceBps].map((t) => (
          <g key={t}>
            <line
              x1={40}
              x2={780}
              y1={y(t)}
              y2={y(t)}
              stroke="#6D001A"
              strokeDasharray="3 4"
            />
            <text x={4} y={y(t) + 4} fill="#6D001A" fontSize={11}>
              {t > 0 ? "+" : "-"}
              {tol}
            </text>
          </g>
        ))}
        <line x1={40} x2={780} y1={y(0)} y2={y(0)} stroke="#E8E4E4" />
        {o.spread24h.map((series, j) => (
          <polyline
            key={COLORS[j]}
            fill="none"
            stroke={COLORS[j]}
            strokeWidth={1.5}
            strokeDasharray={j === 2 ? "4 3" : undefined}
            points={series
              .map(
                (p, i) =>
                  `${(40 + (i / 23) * 740).toFixed(0)},${y(p).toFixed(1)}`,
              )
              .join(" ")}
          />
        ))}
      </svg>
      <p style={{ fontSize: 13 }}>
        Lines: Operator A solid ink, B solid burgundy, C dashed grey. Dotted
        lines mark the contract tolerance ({tol}, a parameter).
      </p>

      <DataTable caption="Contract">
        <thead>
          <tr>
            <th scope="col">Contract</th>
            <th scope="col">Address</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SiliquaOracle</td>
            <td>not deployed</td>
            <td>unverified</td>
          </tr>
        </tbody>
      </DataTable>
      <p style={{ marginTop: 16 }}>
        Reports are signed with EIP-712 typed data. Each report carries the
        index, timestamp, value, sources, methodology version and a nonce. The
        contract rejects reused nonces and reports older than 3 hours.
      </p>
    </div>
  );
}
