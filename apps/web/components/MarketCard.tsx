import Link from "next/link";
import type { Market } from "../lib/api/types";
import { formatInt, formatUsd, formatUtc } from "../lib/format";
import { ProbabilityBar, SampleTag, yesPercent } from "./primitives";
import { StatusChip } from "./StatusChip";
import ui from "./ui.module.css";

export function MarketCard({ market: m }: { market: Market }) {
  const yes = BigInt(m.yesPool);
  const no = BigInt(m.noPool);
  const pct = yesPercent(yes, no);
  return (
    <article className={ui.card}>
      <p className="label">
        <StatusChip status={m.status} />
        {m.winner ? <b> {m.winner}</b> : null} <SampleTag />
      </p>
      <h3 style={{ margin: "14px 0", fontSize: 18 }}>
        <Link href={`/markets/${m.id}`} style={{ textDecoration: "none" }}>
          {m.question}
        </Link>
      </h3>
      <ProbabilityBar yes={yes} no={no} />
      <p style={{ fontSize: 13, margin: 0 }}>
        {yes + no === 0n
          ? "No pool yet"
          : `YES ${pct}% (${pct}¢) · NO ${100 - pct}%`}{" "}
        · Threshold {formatUsd(m.thresholdMicroUsd)}
        <br />
        Closes {formatUtc(m.closesAt)} · Pool {formatInt((yes + no).toString())}{" "}
        USDG
      </p>
    </article>
  );
}
