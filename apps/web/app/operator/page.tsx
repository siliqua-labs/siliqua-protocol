import type { Metadata } from "next";
import { OperatorView } from "../../components/OperatorView";
import ui from "../../components/ui.module.css";
import { getOracle } from "../../lib/api/client";

export const metadata: Metadata = { title: "Operator" };

export default async function OperatorPage() {
  const oracle = await getOracle();
  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> OPERATOR
      </p>
      <h1>
        Your node<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <OperatorView oracle={oracle} />
    </div>
  );
}
