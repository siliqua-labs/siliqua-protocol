"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents, parseCents } from "../lib/format";
import ui from "./ui.module.css";

type Side = "YES" | "NO";
type Step = "approve" | "buy";

// Demo ticket: no wallet and no transaction. The real buy flow arrives with
// the market contracts; this only shows the states a user will see.
export function MarketTicket({
  yesPool,
  noPool,
  capTokens,
}: {
  yesPool: string;
  noPool: string;
  capTokens: number;
}) {
  const [side, setSide] = useState<Side>("YES");
  const [amount, setAmount] = useState("100");
  const [fail, setFail] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [approved, setApproved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const capCents = BigInt(capTokens) * 100n;
  const parsed = parseCents(amount);
  const stake = parsed === null ? 0n : parsed > capCents ? capCents : parsed;
  const own = BigInt(side === "YES" ? yesPool : noPool) * 100n;
  const other = BigInt(side === "YES" ? noPool : yesPool) * 100n;
  // Parimutuel: stake back plus a pro-rata share of the losing pool, minus the 2% fee.
  const payout =
    stake > 0n ? stake + (stake * other * 98n) / ((own + stake) * 100n) : 0n;

  const run = (step: Step) => {
    setStatus("Pending…");
    timer.current = setTimeout(() => {
      if (fail) {
        setStatus("■ Failed (simulated). Try again.");
        return;
      }
      setStatus(`● Confirmed (${step}, demo)`);
      if (step === "approve") setApproved(true);
    }, 900);
  };

  return (
    <div className={ui.card}>
      <p className="label">Ticket · demo only, market not live</p>
      <div className={ui.tabs} role="toolbar" aria-label="Side">
        {(["YES", "NO"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`${ui.btn} ${ui.small} ${s === side ? ui.primary : ""}`}
            aria-pressed={s === side}
            onClick={() => setSide(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="label" htmlFor="ticket-amount">
        Amount (USDG, max {capTokens.toLocaleString("en-US")} per address,
        parameter)
      </label>
      <br />
      <input
        id="ticket-amount"
        className={ui.input}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-invalid={parsed === null}
      />
      <p style={{ marginTop: 10, color: "var(--tx)" }} aria-live="polite">
        {parsed === null
          ? "Enter an amount with up to 2 decimals."
          : `Estimated payout if ${side} wins: ${formatCents(payout)} USDG${parsed > capCents ? " (capped at 1,000)" : ""}`}
      </p>
      <p style={{ fontSize: 12 }}>
        Estimate, changes as the pool changes. Includes your stake and the 2%
        fee.
      </p>
      <label style={{ fontSize: 12 }}>
        <input
          type="checkbox"
          checked={fail}
          onChange={(e) => setFail(e.target.checked)}
        />{" "}
        Simulate failure
      </label>
      <br />
      <br />
      <button
        type="button"
        className={`${ui.btn} ${ui.primary} ${ui.small}`}
        onClick={() => run("approve")}
      >
        1 · Approve
      </button>{" "}
      <button
        type="button"
        className={`${ui.btn} ${ui.small}`}
        disabled={!approved || parsed === null}
        onClick={() => run("buy")}
      >
        2 · Buy
      </button>
      <p className="label" style={{ marginTop: 10 }} role="status">
        {status}
      </p>
    </div>
  );
}
