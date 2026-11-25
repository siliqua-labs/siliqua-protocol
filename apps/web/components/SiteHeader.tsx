import Link from "next/link";
import { siteStrip } from "../lib/siteStrip";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import styles from "./SiteHeader.module.css";
import { WalletButton } from "./WalletButton";
import { XLink } from "./XLink";

export function SiteHeader() {
  const strip = siteStrip(process.env);
  return (
    <>
      {strip ? <div className={styles.strip}>{strip}</div> : null}
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
