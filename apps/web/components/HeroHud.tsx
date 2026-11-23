"use client";

import { type ReactNode, useEffect, useState } from "react";
import styles from "./HeroHud.module.css";

type Props = {
  gpuClass: string;
  // Sample data must never be labelled live.
  isSample: boolean;
  children: ReactNode;
};

function utcParts(now: Date): [string, string] {
  const iso = now.toISOString();
  return [iso.slice(0, 10), iso.slice(11, 19)];
}

// Chips around the 3D scene: UTC clock, sync state and the lead GPU class.
export function HeroHud({ gpuClass, isSample, children }: Props) {
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
        <div className={`${styles.chip} ${styles.klass}`}>{gpuClass}</div>
      </div>
    </div>
  );
}
