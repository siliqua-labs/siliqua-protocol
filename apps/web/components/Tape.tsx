import type { IndexSnapshot } from "../lib/api/types";
import { changeTone, formatChange, formatUsd } from "../lib/format";
import styles from "./Tape.module.css";

// Decorative ticker; the same values are in the table below it.
export function Tape({
  indexes,
  isSample,
}: {
  indexes: IndexSnapshot[];
  isSample: boolean;
}) {
  const items = (copy: string) => [
    ...(isSample ? [<span key={`${copy}-sample`}>SAMPLE DATA</span>] : []),
    ...indexes.map((i) => (
      <span key={`${copy}-${i.indexId}`}>
        {i.indexId} {i.status === "LIVE" ? formatUsd(i.valueMicroUsd) : "n/a"}{" "}
        <i className={`${styles.change} ${changeTone(i.change24hBps)}`}>
          {formatChange(i.change24hBps)}
        </i>
      </span>
    )),
  ];
  return (
    <div className={styles.tape} aria-hidden="true">
      <div>
        {items("a")}
        {items("b")}
      </div>
    </div>
  );
}
