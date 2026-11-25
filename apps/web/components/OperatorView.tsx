"use client";

import type { OracleResponse } from "../lib/api/types";
import { formatBpsPercent, formatUsd, formatUtc } from "../lib/format";
import { useAppState } from "./AppState";
import { DataTable, Notice, SampleTag } from "./primitives";
import ui from "./ui.module.css";

// Reports are hourly; two missed hours is the point where the 3-hour late window is at risk.
const SILENT_AFTER_MS = 2 * 60 * 60 * 1000;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function OperatorView({ oracle }: { oracle: OracleResponse | null }) {
  const { account, openWallet } = useAppState();

  if (!oracle) {
    return (
      <p style={{ marginTop: 24 }}>
        The oracle is not connected to this deployment yet, so there is nothing
        to show.
      </p>
    );
  }
  if (!account) {
    return (
      <>
        <Intro />
        <p style={{ marginTop: 24 }}>
          Connect the wallet that signs your reports. This page only reads
          public data and never asks for a signature or a transaction.
        </p>
        <button type="button" className={ui.btn} onClick={openWallet}>
          Connect wallet
        </button>
      </>
    );
  }

  const me = oracle.operators.find((op) => same(op.address, account));
  if (!me) {
    return (
      <>
        <Intro />
        <Notice>
          <span className="label">Not an operator</span>
          <p>
            The connected wallet is not on the oracle allowlist. Switch to the
            wallet your node signs with.
          </p>
        </Notice>
      </>
    );
  }

  const mySlots = oracle.slots
    .map((slot) => ({
      slot,
      value: slot.values.find((v) => same(v.operator, account)),
    }))
    .slice(0, 12);
  const myRejections = oracle.rejections.filter((r) =>
    same(r.operator, account),
  );
  const silent =
    me.lastSignedAt === null ||
    Date.now() - Date.parse(me.lastSignedAt) > SILENT_AFTER_MS;
  const sample = oracle.isSample ? <SampleTag /> : null;

  return (
    <>
      <Intro />
      <p style={{ marginTop: 24 }}>
        {sample}{" "}
        {me.active ? "● on the allowlist" : "■ removed from the allowlist"}
      </p>
      {silent && me.active ? (
        <Notice>
          <span className="label">No recent report</span>
          <p>
            No signed report from this wallet in the last 2 hours. Check the
            node logs and that the signing key matches this address. Late
            reports are accepted for 3 hours.
          </p>
        </Notice>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <DataTable caption={<>Your reports {sample}</>}>
          <thead>
            <tr>
              <th scope="col">Last signed report</th>
              <th scope="col">Reports, 24h</th>
              <th scope="col">Rejected, recent</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatUtc(me.lastSignedAt)}</td>
              <td>{me.reports24h}</td>
              <td>{myRejections.length}</td>
            </tr>
          </tbody>
        </DataTable>
      </div>

      <div style={{ marginTop: 24 }}>
        <DataTable caption={<>Your recent slots {sample}</>}>
          <thead>
            <tr>
              <th scope="col">Index</th>
              <th scope="col">Slot</th>
              <th scope="col">Your value</th>
              <th scope="col">Gap vs median</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {mySlots.map(({ slot, value }) => (
              <tr key={`${slot.indexId}-${slot.slot}`}>
                <td>{slot.indexLabel}</td>
                <td>{formatUtc(slot.slot)}</td>
                <td>{value ? formatUsd(value.valueMicroUsd, 4) : "none"}</td>
                <td>{value ? formatBpsPercent(value.gapBps) : "n/a"}</td>
                <td>
                  {value === undefined
                    ? "■ missed"
                    : value.kept
                      ? "● kept"
                      : "■ dropped"}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <p style={{ fontSize: 13 }}>
          Dropped: more than {formatBpsPercent(oracle.toleranceBps)} from the
          median of the operators. A run of drops usually means your inputs
          differ from the others.
        </p>
      </div>

      {myRejections.length > 0 ? (
        <div style={{ marginTop: 24 }}>
          <DataTable caption={<>Your rejected reports {sample}</>}>
            <thead>
              <tr>
                <th scope="col">Index</th>
                <th scope="col">Slot</th>
                <th scope="col">Reason</th>
                <th scope="col">Seen</th>
              </tr>
            </thead>
            <tbody>
              {myRejections.map((r) => (
                <tr key={`${r.slot}-${r.at}-${r.reason}`}>
                  <td>{r.indexLabel}</td>
                  <td>{formatUtc(r.slot)}</td>
                  <td>{r.reason}</td>
                  <td>{formatUtc(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ) : null}

      <Notice>
        <span className="label">Key rotation</span>
        <p>
          Ask the multisig to add the new signing address and remove the old
          one, then replace the key in your node's environment. Never paste a
          private key on this site.
        </p>
      </Notice>
    </>
  );
}

function Intro() {
  return (
    <p style={{ marginTop: 20 }}>
      Read-only status for oracle operators. Your node computes and signs on its
      own; this page shows how the network saw your reports.
    </p>
  );
}
