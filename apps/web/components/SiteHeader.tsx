import Link from "next/link";
import { NavLinks } from "./NavLinks";
import styles from "./SiteHeader.module.css";
import { WalletButton } from "./WalletButton";
import { XLink } from "./XLink";

// Sample-data strip stays until the real API replaces the fixtures (ROADMAP 2.9).
export function SiteHeader() {
  return (
    <>
      <div className={styles.strip}>SAMPLE DATA · MARKETS NOT LIVE</div>
      <header className={styles.header}>
        <Link href="/" className={styles.mark} aria-label="Siliqua home">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="10"
              fill="none"
              stroke="#0A0A0A"
              strokeWidth="1.5"
            />
            <rect x="7" y="7" width="8" height="8" fill="#6D001A" />
          </svg>
          SILIQUA
        </Link>
        <NavLinks />
        <XLink className={styles.social} />
        <WalletButton />
      </header>
    </>
  );
}
