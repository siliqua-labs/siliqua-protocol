"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./SiteHeader.module.css";
import { WalletButton } from "./WalletButton";
import { XLink } from "./XLink";

const links = [
  ["/", "Indexes"],
  ["/narratives", "Narratives"],
  ["/markets", "Markets"],
  ["/portfolio", "Portfolio"],
  ["/methodology", "Methodology"],
  ["/oracle", "Oracle"],
] as const;

export function NavLinks() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="primary-nav"
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
      <nav
        id="primary-nav"
        aria-label="Primary"
        className={`${styles.nav} ${open ? styles.open : ""}`}
      >
        {links.map(([href, label]) => {
          const on =
            href === "/"
              ? path === "/" || path.startsWith("/gpu")
              : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          );
        })}
        <div className={styles.extras}>
          <WalletButton />
          <XLink />
        </div>
      </nav>
    </>
  );
}
