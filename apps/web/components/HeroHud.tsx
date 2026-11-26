"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { IndexSnapshot } from "../lib/api/types";
import { formatChange, formatUsd } from "../lib/format";
import styles from "./HeroHud.module.css";

type Props = {
  lead: IndexSnapshot;
  // Sample data must never be labelled live.
  isSample: boolean;
  children: ReactNode;
};

function utcParts(now: Date): [string, string] {
  const iso = now.toISOString();
  return [iso.slice(0, 10), iso.slice(11, 19)];
}

// Bar length in percent. The bars are decoration; the number beside each is the data.
const bar = (percent: number) => Math.min(100, Math.max(4, percent));

function readouts(i: IndexSnapshot): [string, string, number][] {
  const change = (bps: number | null, perBps: number) =>
    bps === null ? bar(0) : bar(50 + bps * perBps);
  return [
    [
      "VALUE",
      formatUsd(i.valueMicroUsd),
      bar(Number(i.valueMicroUsd ?? 0) / 40_000),
    ],
    ["24H", formatChange(i.change24hBps), change(i.change24hBps, 0.08)],
    [
      "VALID.",
      `${i.validSources}/${i.minValidSources}`,
      bar((i.validSources / i.minValidSources) * 50),
    ],
  ];
}

// Chips around the 3D scene: UTC clock, sync state, lead GPU class and its readout.
export function HeroHud({ lead, isSample, children }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [date, time] = now ? utcParts(now) : ["----------", "--:--:--"];
  return (
    <div className={styles.wrap}>
      <div className={styles.float}>
        {children}
        <div className={`${styles.chip} ${styles.clock}`}>
          <em>{date}</em>
          <b>{time}</b>
          <span>UTC</span>
        </div>
        <div className={`${styles.chip} ${styles.sync}`}>
          {isSample ? "SYNC · SAMPLE" : "SYNC · LIVE"}
        </div>
        <div className={`${styles.chip} ${styles.klass}`}>{lead.gpuClass}</div>
        <div className={styles.readout}>
          <div>
            <small>COMPUTE INDEX · USD / GPU-HR</small>
            <strong>{lead.indexId}</strong>
            {readouts(lead).map(([label, value, width]) => (
              <p key={label}>
                <span>{label}</span>
                <s aria-hidden="true">
                  <u style={{ width: `${width}%` }} />
                </s>
                <b>{value}</b>
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
