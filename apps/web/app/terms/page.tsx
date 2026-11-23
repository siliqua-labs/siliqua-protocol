import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      sections={[
        "Acceptance",
        "Use of index data",
        "Markets and eligibility",
        "Restricted regions",
        "No advice",
        "Disclaimers",
        "Changes",
        "Contact",
      ]}
    />
  );
}
