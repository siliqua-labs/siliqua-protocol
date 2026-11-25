import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      sections={[
        {
          heading: "Acceptance",
          paragraphs: [
            "By using this website or its API you agree to these terms. If you do not agree, do not use them.",
          ],
        },
        {
          heading: "Use of index data",
          paragraphs: [
            "Siliqua publishes the GPU rent index (GRI) and the compute narrative index (CMI) for information. Values come from third-party price pages and public posts, are computed under the published methodology, and may be delayed, stale or wrong. The oracle is run by three operators from the Siliqua team, with no stake or slashing in version 1, so it is a trusted setup.",
            "You may read and reuse the published index values. Sources have their own terms, and redistribution of their raw data is not granted by us.",
          ],
        },
        {
          heading: "Markets and eligibility",
          paragraphs: [
            "Markets are smart contracts. They are immutable once created and there is no admin path to change or rescue a running market. Where markets run on a test network, the tokens have no monetary value.",
            "You must be allowed by the law that applies to you to take part. You are responsible for knowing whether that is the case.",
          ],
        },
        {
          heading: "Restricted regions",
          paragraphs: [
            "Markets may be unavailable in some regions. Index data stays open everywhere. The list of restricted regions is not final and will be published on the restricted region page.",
          ],
        },
        {
          heading: "No advice",
          paragraphs: [
            "Siliqua is not a broker or adviser. Nothing here is investment, legal or tax advice.",
          ],
        },
        {
          heading: "Disclaimers",
          paragraphs: [
            "The service is provided as is, without warranties of any kind. To the extent the law allows, we are not liable for losses from using the data, the website or the contracts, including losses from smart-contract bugs, oracle errors or blockchain faults.",
          ],
        },
        {
          heading: "Changes",
          paragraphs: [
            "We may change these terms or the service. The date of the latest change is the date of the latest version of this page.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: ["Reach us on X at @SiliquaCompute."],
        },
      ]}
    />
  );
}
