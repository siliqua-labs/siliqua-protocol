"use client";

import type { ChipStatus } from "../lib/api/types";
import { shortAddress, useAppState } from "./AppState";
import { DataTable, SampleTag } from "./primitives";
import { StatusChip } from "./StatusChip";
import ui from "./ui.module.css";

type Action = "claim" | "refund" | "none";
const ROWS: {
  market: string;
  side: "YES" | "NO";
  stake: number;
  outcome: string;
  status: ChipStatus;
  action: Action;
}[] = [
  {
    market: "GRI-H100 > $2.50",
    side: "YES",
    stake: 100,
    outcome: "Open",
    status: "OPEN",
    action: "none",
  },
  {
    market: "GRI-H100 > $2.30",
    side: "YES",
    stake: 60,
    outcome: "Claimable 114.20",
    status: "SETTLED",
    action: "claim",
  },
  {
    market: "GRI-H100 > $2.35",
    side: "NO",
    stake: 50,
    outcome: "Refundable 50.00",
    status: "VOID",
    action: "refund",
  },
  {
    market: "GRI-H100 > $2.60",
    side: "YES",
    stake: 40,
    outcome: "Lost",
    status: "SETTLED",
    action: "none",
  },
];

// The rows are sample data; only the connected address is real. Real positions come from the indexer.
export function PortfolioView() {
  const { account, openWallet, toast } = useAppState();
  if (!account) {
    return (
      <div className={ui.card} style={{ marginTop: 24 }}>
        <p>Connect a wallet to see your positions.</p>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary}`}
          onClick={openWallet}
        >
          Connect wallet
        </button>
      </div>
    );
  }
  return (
    <>
      <p className="label" style={{ marginTop: 16 }}>
        {shortAddress(account)} · <SampleTag />
      </p>
      <div style={{ marginTop: 20 }}>
        <DataTable caption="Positions (USDG)">
          <thead>
            <tr>
              <th scope="col">Market</th>
              <th scope="col">Side</th>
              <th scope="col">Stake</th>
              <th scope="col">Outcome</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.market}>
                <td>{r.market}</td>
                <td>{r.side}</td>
                <td>{r.stake}</td>
                <td>{r.outcome}</td>
                <td>
                  <StatusChip status={r.status} />
                </td>
                <td>
                  {r.action === "none" ? (
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.small}`}
                      disabled
                    >
                      —
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.small} ${ui.primary}`}
                      onClick={() =>
                        toast(
                          r.action === "claim"
                            ? "Claim submitted (mock)"
                            : "Refund submitted (mock)",
                        )
                      }
                    >
                      {r.action === "claim" ? "Claim" : "Refund"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <p style={{ marginTop: 16 }}>
        Total claimable: 114.20 USDG · Total refundable: 50.00 USDG
      </p>
    </>
  );
}
