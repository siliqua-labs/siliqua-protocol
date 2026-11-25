import type { ChipStatus } from "../lib/api/types";
import styles from "./StatusChip.module.css";

const chips: Record<ChipStatus, { mark: string; label: string; hint: string }> =
  {
    LIVE: {
      mark: "●",
      label: "Live",
      hint: "Published this hour with enough valid sources.",
    },
    STALE: {
      mark: "▲",
      label: "Stale",
      hint: "No fresh print. Last value is shown and marked.",
    },
    INSUFFICIENT_SOURCES: {
      mark: "■",
      label: "Insufficient sources",
      hint: "Fewer than 5 valid sources after the outlier filter. Not published.",
    },
    OPEN: { mark: "●", label: "Open", hint: "Accepting positions." },
    CLOSED: {
      mark: "◐",
      label: "Closed",
      hint: "Closed. TWAP window running.",
    },
    SETTLING: {
      mark: "◐",
      label: "Settling",
      hint: "Settlement can be called.",
    },
    SETTLED: { mark: "●", label: "Settled", hint: "Paid out." },
    VOID: { mark: "■", label: "Void", hint: "Cancelled. Funds refundable." },
    RUNNING: {
      mark: "◐",
      label: "Running on testnet",
      hint: "Works on the test network. The gate below is not passed yet.",
    },
    NOT_LIVE: {
      mark: "○",
      label: "Not live",
      hint: "Opens after legal review and contract audit.",
    },
  };

export function StatusChip({ status }: { status: ChipStatus }) {
  const c = chips[status];
  return (
    <span className={`${styles.chip} ${styles[status]}`} title={c.hint}>
      {c.mark} {c.label}
    </span>
  );
}
