import type { Metadata } from "next";
import { ContractTable } from "../../components/ContractTable";
import { DataTable, Notice, SampleTag } from "../../components/primitives";
import { StatusChip } from "../../components/StatusChip";
import ui from "../../components/ui.module.css";
import { getOracle } from "../../lib/api/client";
import type { OracleResponse } from "../../lib/api/types";
import { factoryOracle, marketChainConfig } from "../../lib/chain";
import { formatBpsPercent, formatUsd, formatUtc } from "../../lib/format";

export const metadata: Metadata = { title: "Oracle" };

const W = 800;
const H = 220;
const COLORS = ["#0A0A0A", "#6D001A", "#6B6767"];

const short = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export default async function OraclePage() {
  const o = await getOracle();
  const chain = marketChainConfig();
  const oracleAddress = chain ? await factoryOracle(chain) : null;
  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> ORACLE
      </p>
      <h1>
        Who signs the print<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        <StatusChip status={o ? "LIVE" : "NOT_LIVE"} />{" "}
        {o?.isSample ? <SampleTag /> : null}
      </p>
      <Notice>
        <span className="label">v1 trust model</span>
        <ul>
          <li>Three operators, all from the Siliqua team. Not independent.</li>
          <li>
            Each operator signs its own value. Values more than the tolerance
            from the median are dropped, and at least 2 must remain.
          </li>
          <li>No stake and no slashing in v1.</li>
          <li>The operator allowlist is managed by a multisig.</li>
          <li>
            Operators may not bet in markets they report on, and their wallets
            are announced.
          </li>
        </ul>
      </Notice>
      {o ? <OracleData o={o} /> : <NotConfigured />}
      <ContractTable
        caption="Contract"
        chainEnv={chain?.chainEnv ?? null}
        rows={[{ name: "SiliquaOracle", address: oracleAddress }]}
      />
      <p style={{ marginTop: 16 }}>
        Reports are signed with EIP-712 typed data. Each report carries the
        index, timestamp, value, sources, methodology version and a nonce. The
        contract rejects reused nonces and reports older than 3 hours.
      </p>
    </div>
  );
}

function NotConfigured() {
  return (
    <p style={{ marginTop: 24 }}>
      The oracle is not connected to this deployment yet, so there are no
      reports to show.
    </p>
  );
}

function OracleData({ o }: { o: OracleResponse }) {
  const tol = formatBpsPercent(o.toleranceBps).replace(".00", "");
  const operators = o.operators.map((op) => op.address);
  const sample = o.isSample ? <SampleTag /> : null;
  return (
    <>
      <div style={{ marginTop: 24 }}>
        <DataTable caption={<>Operators {sample}</>}>
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col">Status</th>
              <th scope="col">Last signed report</th>
              <th scope="col">Reports, 24h</th>
            </tr>
          </thead>
          <tbody>
            {o.operators.map((op) => (
              <tr key={op.address}>
                <td>{short(op.address)}</td>
                <td>{op.active ? "● on the allowlist" : "■ removed"}</td>
                <td>{formatUtc(op.lastSignedAt)}</td>
                <td>{op.reports24h}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div style={{ marginTop: 24 }}>
        <DataTable caption={<>Recent slots {sample}</>}>
          <thead>
            <tr>
              <th scope="col">Index</th>
              <th scope="col">Slot</th>
              {operators.map((address) => (
                <th scope="col" key={address}>
                  {short(address)}
                </th>
              ))}
              <th scope="col">Max gap vs median</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {o.slots.map((slot) => (
              <tr key={`${slot.indexId}-${slot.slot}`}>
                <td>{slot.indexLabel}</td>
                <td>{formatUtc(slot.slot)}</td>
                {operators.map((address) => {
                  const v = slot.values.find((x) => x.operator === address);
                  return (
                    <td key={`${slot.slot}-${address}`}>
                      {v
                        ? `${formatUsd(v.valueMicroUsd, 4)}${v.kept ? "" : " ■"}`
                        : "none"}
                    </td>
                  );
                })}
                <td>{formatBpsPercent(slot.maxGapBps)}</td>
                <td>
                  {slot.finalizedValueMicroUsd === null
                    ? "■ not finalized"
                    : `● ${formatUsd(slot.finalizedValueMicroUsd, 4)} · ${slot.keptCount} kept`}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <p style={{ fontSize: 13 }}>
          ■ next to a value: dropped for being more than {tol} from the median.
          Every operator value is on chain, dropped or not.
        </p>
      </div>

      {o.rejections.length > 0 ? (
        <div style={{ marginTop: 24 }}>
          <DataTable caption={<>Rejected reports {sample}</>}>
            <thead>
              <tr>
                <th scope="col">Index</th>
                <th scope="col">Slot</th>
                <th scope="col">Signer</th>
                <th scope="col">Reason</th>
                <th scope="col">Seen</th>
              </tr>
            </thead>
            <tbody>
              {o.rejections.map((r) => (
                <tr key={`${r.slot}-${r.operator}-${r.at}-${r.reason}`}>
                  <td>{r.indexLabel}</td>
                  <td>{formatUtc(r.slot)}</td>
                  <td>{short(r.operator)}</td>
                  <td>{r.reason}</td>
                  <td>{formatUtc(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ) : null}

      <Spread o={o} operators={operators} tol={tol} />
    </>
  );
}

function Spread({
  o,
  operators,
  tol,
}: {
  o: OracleResponse;
  operators: string[];
  tol: string;
}) {
  // Oldest slot on the left; the axis spans +/-1.6x the tolerance.
  const slots = [...o.slots].reverse();
  const span = o.toleranceBps * 1.6;
  const y = (bps: number) =>
    H / 2 - (Math.max(-span, Math.min(span, bps)) / span) * (H / 2);
  const last = Math.max(slots.length - 1, 1);
  return (
    <>
      <h3 className={ui.h3}>Operator spread, latest {slots.length} slots</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Each operator deviation from the slot median. Contract tolerance is ${tol}.`}
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
        {operators.map((address, j) => (
          <polyline
            key={address}
            fill="none"
            stroke={COLORS[j % COLORS.length]}
            strokeWidth={1.5}
            strokeDasharray={j % 3 === 2 ? "4 3" : undefined}
            points={slots
              .flatMap((slot, i) => {
                const v = slot.values.find((x) => x.operator === address);
                if (!v) return [];
                const x = (40 + (i / last) * 740).toFixed(0);
                return [`${x},${y(v.deviationBps).toFixed(1)}`];
              })
              .join(" ")}
          />
        ))}
      </svg>
      <p style={{ fontSize: 13 }}>
        One line per operator, in the column order above. Dotted lines mark the
        contract tolerance ({tol}, a parameter).
      </p>
    </>
  );
}
