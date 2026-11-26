import type { ChipStatus } from "../lib/api/types";
import styles from "./StatusChip.module.css";

const chips: Record<ChipStatus, { mark: string; label: string }> = {
  LIVE: {
    mark: "●",
    label: "Live",
  },
  STALE: {
    mark: "▲",
    label: "Stale",
  },
  INSUFFICIENT_SOURCES: {
    mark: "■",
    label: "Insufficient sources",
  },
  OPEN: { mark: "●", label: "Open" },
  CLOSED: {
    mark: "◐",
    label: "Closed",
  },
  SETTLING: {
    mark: "◐",
    label: "Settling",
  },
  SETTLED: { mark: "●", label: "Settled" },
  VOID: { mark: "■", label: "Void" },
  RUNNING: {
    mark: "◐",
    label: "Running on testnet",
  },
  NOT_LIVE: {
    mark: "○",
    label: "Not live",
  },
};

export function StatusChip({ status }: { status: ChipStatus }) {
  const c = chips[status];
  return (
    <span className={`${styles.chip} ${styles[status]}`}>
      {c.mark} {c.label}
    </span>
  );
}
