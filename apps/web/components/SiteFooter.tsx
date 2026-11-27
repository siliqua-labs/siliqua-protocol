import Link from "next/link";
import { Logo } from "./Logo";
import styles from "./SiteFooter.module.css";
import { XLink } from "./XLink";

const columns = [
  [
    "Product",
    [
      ["Index", "/"],
      ["Narrative", "/narratives"],
      ["Markets", "/markets"],
      ["Portfolio", "/portfolio"],
    ],
  ],
  [
    "Infrastructure",
    [
      ["Methodology", "/methodology"],
      ["Oracles", "/oracle"],
    ],
  ],
  [
    "Resources",
    [
      ["Docs", "/docs"],
      ["Whitepaper", "/whitepaper"],
      ["FAQ", "/faq"],
    ],
  ],
] as const;

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div className={styles.brand}>
          <Link href="/" className={styles.mark} aria-label="Siliqua home">
            <Logo height={40} />
            SILIQUA
          </Link>
          <p className={styles.tagline}>Onchain Wealth. With Discipline.</p>
          <XLink className={styles.social} />
        </div>
        {columns.map(([title, items]) => (
          <div key={title}>
            <h4>{title}</h4>
            <ul>
              {items.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={styles.legal}>
        Siliqua is a thematic onchain asset protocol. This site is for
        informational purposes only and not financial advice.
      </p>
      <div className={styles.bottom}>
        <span>© 2026 Siliqua</span>
        <span aria-hidden="true">·</span>
        <Link href="/privacy">Privacy</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms">Terms</Link>
      </div>
    </footer>
  );
}
