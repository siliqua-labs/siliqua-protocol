import Link from "next/link";
import { Logo } from "./Logo";
import { PlaceholderLink } from "./PlaceholderLink";
import styles from "./SiteFooter.module.css";
import { XLink } from "./XLink";

const columns = [
  [
    "Product",
    [
      ["/", "Indexes"],
      ["/narratives", "Narratives"],
      ["/markets", "Markets"],
      ["/portfolio", "Portfolio"],
    ],
  ],
  [
    "Transparency",
    [
      ["/methodology", "Methodology"],
      ["/oracle", "Oracle"],
      ["/data", "Data & API"],
    ],
  ],
] as const;

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div>
          <Link href="/" className={styles.mark} aria-label="Siliqua home">
            <Logo height={30} />
            SILIQUA
          </Link>
          <p className={styles.legal}>
            Siliqua publishes index data only. Not a broker or adviser, and not
            investment, legal or tax advice. Markets may be restricted in your
            jurisdiction. Data may be delayed or stale.
          </p>
          <XLink className={styles.social} />
        </div>
        {columns.map(([title, items]) => (
          <div key={title}>
            <h4>{title}</h4>
            <ul>
              {items.map(([href, label]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h4>Ecosystem</h4>
          <ul>
            <li>
              <PlaceholderLink>Velamen</PlaceholderLink>
            </li>
            <li>
              <PlaceholderLink>Stigmer</PlaceholderLink>
            </li>
          </ul>
        </div>
      </div>
      <div className={styles.bottom}>
        <span>© 2026 Siliqua</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <PlaceholderLink>Farcaster</PlaceholderLink>
      </div>
    </footer>
  );
}
