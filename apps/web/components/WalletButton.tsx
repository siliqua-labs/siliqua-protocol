"use client";

import { PLACEHOLDER_ADDRESS, useAppState } from "./AppState";
import styles from "./SiteHeader.module.css";
import ui from "./ui.module.css";

export function WalletButton() {
  const { walletConnected, openWallet } = useAppState();
  return (
    <button
      type="button"
      className={`${ui.btn} ${ui.small} ${styles.wallet}`}
      onClick={openWallet}
    >
      {walletConnected ? PLACEHOLDER_ADDRESS : "Connect wallet"}
    </button>
  );
}
