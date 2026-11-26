import type { Metadata } from "next";
import { ButtonLink } from "../components/primitives";
import ui from "../components/ui.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  // A missing page has no preferred address.
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> 404
      </p>
      <h1>
        Page not found<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p>
        There is no page at this address. The index data and the markets are
        still where they were.
      </p>
      <div className={ui.actions}>
        <ButtonLink href="/" primary>
          View the indexes
        </ButtonLink>
        <ButtonLink href="/markets">See markets</ButtonLink>
      </div>
    </div>
  );
}
