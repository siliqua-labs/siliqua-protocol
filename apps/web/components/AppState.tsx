"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./AppState.module.css";
import ui from "./ui.module.css";

export type FxLevel = "Subtle" | "Default" | "Bold";
type WalletStep = "closed" | "pick" | "busy" | "ok";

type AppStateValue = {
  // Mock only: no wallet provider is ever contacted. Real wagmi + viem lands with markets.
  walletConnected: boolean;
  openWallet: () => void;
  toast: (message: string) => void;
  fx: FxLevel;
  setFx: (level: FxLevel) => void;
};

const Ctx = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState used outside AppStateProvider");
  return v;
}

const PLACEHOLDER_ADDRESS = "0x0000…0000";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<WalletStep>("closed");
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fx, setFx] = useState<FxLevel>("Bold");
  const dialog = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 2600);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (step === "closed") {
      if (d.open) d.close();
    } else if (!d.open) {
      d.showModal();
    }
  }, [step]);

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(busyTimer.current);
    },
    [],
  );

  const openWallet = useCallback(
    () => setStep(connected ? "ok" : "pick"),
    [connected],
  );

  const connect = () => {
    setStep("busy");
    busyTimer.current = setTimeout(() => {
      setConnected(true);
      setStep("ok");
    }, 900);
  };
  const disconnect = () => {
    setConnected(false);
    setStep("closed");
    toast("Disconnected (mock)");
  };

  const value = useMemo(
    () => ({ walletConnected: connected, openWallet, toast, fx, setFx }),
    [connected, openWallet, toast, fx],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="wallet-title"
        onClose={() => setStep("closed")}
      >
        {step === "pick" && (
          <>
            <h3 id="wallet-title" style={{ fontSize: 20 }}>
              Connect wallet
            </h3>
            <p className="label" style={{ margin: "8px 0" }}>
              MOCK · NO WALLET IS CONTACTED
            </p>
            <button
              type="button"
              className={`${ui.btn} ${styles.option}`}
              onClick={connect}
            >
              Browser wallet
            </button>
            <button
              type="button"
              className={`${ui.btn} ${styles.option}`}
              onClick={connect}
            >
              WalletConnect-style QR
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.small}`}
              onClick={() => setStep("closed")}
            >
              Cancel
            </button>
          </>
        )}
        {step === "busy" && (
          <>
            <h3 id="wallet-title" style={{ fontSize: 20 }}>
              Connecting…
            </h3>
            <p className={`${ui.btn} ${ui.loading}`} style={{ border: 0 }}>
              Waiting for approval
            </p>
          </>
        )}
        {step === "ok" && (
          <>
            <h3 id="wallet-title" style={{ fontSize: 20 }}>
              Connected
            </h3>
            <p>
              {PLACEHOLDER_ADDRESS} <span className="label">placeholder</span>
            </p>
            <button type="button" className={ui.btn} onClick={disconnect}>
              Disconnect
            </button>{" "}
            <button
              type="button"
              className={`${ui.btn} ${ui.small}`}
              onClick={() => setStep("closed")}
            >
              Close
            </button>
          </>
        )}
      </dialog>
      <div
        className={styles.toast}
        role="status"
        aria-live="polite"
        hidden={message === null}
      >
        {message}
      </div>
    </Ctx.Provider>
  );
}

export { PLACEHOLDER_ADDRESS };
