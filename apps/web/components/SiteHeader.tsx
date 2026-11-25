import Link from "next/link";
import { Logo } from "./Logo";
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
          <Logo height={28} />
          SILIQUA
        </Link>
        <NavLinks />
        <XLink className={styles.social} />
        <WalletButton />
      </header>
    </>
  );
}
