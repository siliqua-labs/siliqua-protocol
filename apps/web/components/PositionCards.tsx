"use client";

import { useAppState } from "./AppState";
import ui from "./ui.module.css";

// Sample positions with mock actions; claim and refund are contract calls later.
export function PositionCards() {
  const { toast } = useAppState();
  return (
    <div className={ui.grid2}>
      <div className={ui.card}>
        <p className="label">Settled YES · won</p>
        <p>Claimable: 14.20 USDG</p>
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${ui.primary}`}
          onClick={() => toast("Claim submitted (mock)")}
        >
          Claim
        </button>{" "}
        <button type="button" className={`${ui.btn} ${ui.small}`} disabled>
          Refund
        </button>
      </div>
      <div className={ui.card}>
        <p className="label">Void · refundable</p>
        <p>Refundable: 50.00 USDG</p>
        <button type="button" className={`${ui.btn} ${ui.small}`} disabled>
          Claim
        </button>{" "}
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${ui.primary}`}
          onClick={() => toast("Refund submitted (mock)")}
        >
          Refund
        </button>
      </div>
    </div>
  );
}
