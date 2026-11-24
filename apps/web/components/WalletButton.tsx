"use client";

import { shortAddress, useAppState } from "./AppState";
import styles from "./SiteHeader.module.css";
import ui from "./ui.module.css";

export function WalletButton() {
  const { account, openWallet } = useAppState();
  return (
    <button
      type="button"
      className={`${ui.btn} ${ui.small} ${styles.wallet}`}
      onClick={openWallet}
    >
      {account ? shortAddress(account) : "Connect wallet"}
    </button>
  );
}
