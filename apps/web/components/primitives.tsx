import Link from "next/link";
import type { ReactNode } from "react";
import ui from "./ui.module.css";

export function SampleTag() {
  return <span className={ui.tag}>SAMPLE DATA</span>;
}

export function Notice({
  tone,
  children,
}: {
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <div className={`${ui.notice} ${tone ? ui.danger : ""}`}>{children}</div>
  );
}

export function DataTable({
  caption,
  children,
  hidden,
  id,
}: {
  caption: ReactNode;
  children: ReactNode;
  hidden?: boolean;
  id?: string;
}) {
  return (
    <div className={ui.tableWrap} hidden={hidden} id={id}>
      <table>
        <caption>
          <span>{caption}</span>
        </caption>
        {children}
      </table>
    </div>
  );
}

export function ButtonLink({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${ui.btn} ${primary ? ui.primary : ""}`}>
      {children}
    </Link>
  );
}

export function ProbabilityBar({ yes, no }: { yes: bigint; no: bigint }) {
  const total = yes + no;
  const yesPct = total === 0n ? 50 : Number((yes * 100n) / total);
  return (
    <div
      className={ui.prob}
      role="img"
      aria-label={`YES ${yesPct} percent, NO ${100 - yesPct} percent`}
    >
      <i className={ui.yes} style={{ width: `${yesPct}%` }} />
      <i className={ui.no} style={{ width: `${100 - yesPct}%` }} />
    </div>
  );
}

export function yesPercent(yes: bigint, no: bigint): number {
  return yes + no === 0n ? 50 : Number((yes * 100n) / (yes + no));
}
