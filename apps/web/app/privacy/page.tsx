import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      sections={[
        "Scope",
        "Information we collect",
        "How information is used",
        "Retention",
        "Your choices",
        "Contact",
      ]}
    />
  );
}
