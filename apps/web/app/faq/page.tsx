import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import ui from "../../components/ui.module.css";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Common questions about the Siliqua indexes, oracle and testnet markets.",
};

const GROUPS: [string, [string, ReactNode][]][] = [
  [
    "General",
    [
      [
        "What is Siliqua?",
        "Two published indexes, GPU rent (GRI) and compute narrative share (CMI), and a weekly YES or NO market on the GPU rent index.",
      ],
      [
        "Is it live?",
        "It runs on Robinhood Chain Testnet only. The contracts are not audited and mainnet is not deployed.",
      ],
      [
        "Do the tokens have value?",
        "No. Markets use test tUSDG, which has no monetary value.",
      ],
    ],
  ],
  [
    "Indexes",
    [
      [
        "Where do GPU prices come from?",
        "From provider price listings, on-demand only. The sources behind the latest hour are listed on each GPU index page.",
      ],
      [
        "Why does a class show no value?",
        "Fewer than 5 valid sources remained for that hour. The hour is not published, and no older value is presented as live.",
      ],
      [
        "Is CMI stored on chain?",
        "No. It is computed daily and served by the API.",
      ],
      [
        "Can I use the values?",
        <>
          You may read and reuse the published index values. Raw source data has
          its own terms. See <Link href="/terms">Terms</Link>.
        </>,
      ],
    ],
  ],
  [
    "Markets",
    [
      [
        "How is a market decided?",
        "By the 24-hour average of the hourly index. Above the threshold is YES. Equal or below is NO.",
      ],
      [
        "What is the fee?",
        "2% of the losing pool, taken at settlement. Void markets and markets with an empty losing side pay no fee.",
      ],
      [
        "When do I get a refund?",
        "When the market is void: more than 6 hours of the window have no value, the winning side has no stake, or nobody settled within 14 days of the settle time.",
      ],
      [
        "Can I withdraw before settlement?",
        "No. A stake stays in the market until it is settled or void.",
      ],
      [
        "Is there a limit per wallet?",
        "Yes, a cap per address per market across both sides, 1,000 tUSDG in the current template. Using more addresses gets around it, so it is not a guarantee.",
      ],
      [
        "Can the team change or pause a market?",
        "A running market cannot be changed. A pause stops new buys only, never claims or refunds.",
      ],
    ],
  ],
  [
    "Trust and safety",
    [
      [
        "Who runs the oracle?",
        <>
          Three operators, all from the Siliqua team, with no stake and no
          slashing in version 1. They are not independent. See{" "}
          <Link href="/oracle">Oracle</Link>.
        </>,
      ],
      [
        "Can I check a value myself?",
        <>
          Every operator value is emitted on chain, and the rules are published.
          Steps are in <Link href="/docs#verify">Docs</Link>.
        </>,
      ],
      [
        "Are markets available in my country?",
        <>
          They may be restricted or prohibited where you are. You are
          responsible for checking. The list of{" "}
          <Link href="/restricted">restricted regions</Link> is not final.
        </>,
      ],
      [
        "Do you hold my keys?",
        "No. You sign in your own wallet. We never see your private key or seed phrase.",
      ],
    ],
  ],
];

export default function FaqPage() {
  return (
    <div className={`${ui.page} ${ui.doc}`}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> FAQ
      </p>
      <h1>
        Questions and answers<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      {GROUPS.map(([group, items]) => (
        <section key={group}>
          <h3>{group}</h3>
          {items.map(([question, answer]) => (
            <details key={question} className={ui.faq}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      ))}
      <p style={{ marginTop: 32 }}>
        More detail: <Link href="/docs">Docs</Link> and{" "}
        <Link href="/whitepaper">Whitepaper</Link>.
      </p>
    </div>
  );
}
