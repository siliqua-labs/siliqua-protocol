import type { Metadata } from "next";
import { ButtonLink } from "../../components/primitives";
import ui from "../../components/ui.module.css";

export const metadata: Metadata = { title: "Restricted region" };

// Target of the region check (frontend and API) that arrives with markets.
export default function RestrictedPage() {
  return (
    <div className={ui.page}>
      <p className="label">■ REGION RESTRICTION</p>
      <h1>
        Markets are restricted here<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 24 }}>
        Prediction markets may be restricted or prohibited where you are. Index
        data stays open: you can still read every index, chart, source table and
        the methodology. Only market participation is limited.
      </p>
      <div className={ui.card}>
        <p className="label">Restricted regions</p>
        <p style={{ margin: 0 }}>To be defined with counsel.</p>
      </div>
      <div className={ui.cta}>
        <ButtonLink href="/" primary>
          View the indexes
        </ButtonLink>
        <ButtonLink href="/methodology">Read the methodology</ButtonLink>
      </div>
    </div>
  );
}
