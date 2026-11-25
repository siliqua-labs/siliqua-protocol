import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      sections={[
        {
          heading: "Scope",
          paragraphs: [
            "This page covers the Siliqua website and its public read-only API. It does not cover wallets, block explorers or other sites you reach from here.",
          ],
        },
        {
          heading: "Information we collect",
          paragraphs: [
            "Visits. Our hosting providers keep technical logs of requests, such as the IP address, the browser and the page requested. The API also uses the IP address to limit requests to 60 per minute.",
            "Wallet. If you connect a wallet, the page reads your public address in your browser. Transactions you send are public on the blockchain and cannot be removed by us. We never see your private keys or seed phrase.",
            "Social posts for the narrative index (CMI). From public posts on Farcaster and Bluesky we store the post ID, the author ID, the time of the post and of the account, a topic label, a bot score and a credibility weight. We do not store the text of posts.",
            "The site sets no cookies and runs no analytics or advertising trackers.",
          ],
        },
        {
          heading: "How information is used",
          paragraphs: [
            "Logs are used to run, secure and rate-limit the service. Social post data is used only to compute the narrative index, and the index publishes post IDs, labels and bot scores, never post text. We do not sell personal information.",
          ],
        },
        {
          heading: "Retention",
          paragraphs: [
            "Stored social posts are deleted after 10 days. Computed index values are kept. Provider logs follow the retention of those providers.",
          ],
        },
        {
          heading: "Your choices",
          paragraphs: [
            "You can use the index pages without connecting a wallet. If you want a social post or account removed from our data, contact us with the post ID or account and we will delete it.",
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
