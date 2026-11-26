import Link from "next/link";
import type { Market } from "../lib/api/types";
import { formatInt, formatUsd, formatUtc } from "../lib/format";
import {
  ButtonLink,
  ProbabilityBar,
  SampleTag,
  yesPercent,
} from "./primitives";
import { StatusChip } from "./StatusChip";
import ui from "./ui.module.css";

export function MarketCard({
  market: m,
  // The home page and design sheet show forced NOT_LIVE previews, so sample is the default.
  isSample = true,
  // Adds the resolution criteria and the buy actions under the pool numbers.
  detailed = false,
}: {
  market: Market;
  isSample?: boolean;
  detailed?: boolean;
}) {
  const yes = BigInt(m.yesPool);
  const no = BigInt(m.noPool);
  const pct = yesPercent(yes, no);
  const notLive = m.status === "NOT_LIVE";
  return (
    <article className={ui.card}>
      <p className="label">
        {detailed ? "Weekly market " : null}
        {detailed && notLive ? null : <StatusChip status={m.status} />}
        {m.winner ? <b> {m.winner}</b> : null} {isSample ? <SampleTag /> : null}
      </p>
      <h3 className={detailed ? ui.questionLarge : ui.question}>
        <Link href={`/markets/${m.id}`} style={{ textDecoration: "none" }}>
          {m.question}
        </Link>
      </h3>
      <ProbabilityBar yes={yes} no={no} />
      <p className={ui.stats}>
        {yes + no === 0n
          ? "No pool yet"
          : `YES ${pct}% (${pct}¢) · NO ${100 - pct}%`}{" "}
        · Threshold {formatUsd(m.thresholdMicroUsd)}
        <br />
        Closes {formatUtc(m.closesAt)} · Pool {formatInt((yes + no).toString())}{" "}
        USDG
      </p>
      {detailed ? (
        <>
          {notLive ? (
            <div className={ui.pill}>
              NOT LIVE · Opens after legal review and contract audit
            </div>
          ) : null}
          <div className={ui.notice}>
            <span className="label">Resolution criteria</span>
            <br />
            24-hour TWAP of {m.indexLabel ?? "the index"} from SiliquaOracle.
            Above threshold is YES. Equal to threshold is NO.
          </div>
          <div className={ui.actions}>
            {notLive ? (
              <>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.primary}`}
                  disabled
                >
                  Buy YES
                </button>
                <button type="button" className={ui.btn} disabled>
                  Buy NO
                </button>
              </>
            ) : (
              <>
                <ButtonLink href={`/markets/${m.id}`} primary>
                  Buy YES
                </ButtonLink>
                <ButtonLink href={`/markets/${m.id}`}>Buy NO</ButtonLink>
              </>
            )}
          </div>
        </>
      ) : null}
    </article>
  );
}
