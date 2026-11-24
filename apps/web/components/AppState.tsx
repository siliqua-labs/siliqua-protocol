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
import {
  connectWallet,
  disconnectWallet,
  errorText,
  useAccount,
  type WalletChain,
} from "../lib/wallet";
import styles from "./AppState.module.css";
import ui from "./ui.module.css";

export type FxLevel = "Subtle" | "Default" | "Bold";
type WalletStep = "closed" | "busy" | "ok" | "error";

type AppStateValue = {
  account: string | null;
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

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AppStateProvider({
  chain,
  children,
}: {
  chain: WalletChain;
  children: ReactNode;
}) {
  const [step, setStep] = useState<WalletStep>("closed");
  const [failure, setFailure] = useState("");
  const account = useAccount();
  const connected = account !== null;
  const [message, setMessage] = useState<string | null>(null);
  const [fx, setFx] = useState<FxLevel>("Bold");
  const dialog = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    },
    [],
  );

  const connect = useCallback(() => {
    setStep("busy");
    connectWallet(chain).then(
      () => setStep("ok"),
      (error: unknown) => {
        setFailure(errorText(error));
        setStep("error");
      },
    );
  }, [chain]);

  // No chooser: there is one wallet source, so the click goes straight to the wallet prompt.
  const openWallet = useCallback(() => {
    if (connected) setStep("ok");
    else connect();
  }, [connected, connect]);
  const disconnect = () => {
    disconnectWallet().then(
      (revoked) => {
        setStep("closed");
        toast(
          revoked
            ? "Disconnected"
            : "Forgotten here. Remove the site in your wallet to fully disconnect",
        );
      },
      (error: unknown) => toast(errorText(error)),
    );
  };

  const value = useMemo(
    () => ({
      account,
      openWallet,
      toast,
      fx,
      setFx,
    }),
    [account, openWallet, toast, fx],
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
        {step === "busy" && (
          <>
            <h3 id="wallet-title" style={{ fontSize: 20 }}>
              Connecting…
            </h3>
            <p className={`${ui.btn} ${ui.loading}`} style={{ border: 0 }}>
              Approve the request in your wallet
            </p>
          </>
        )}
        {step === "ok" && (
          <>
            <h3 id="wallet-title" style={{ fontSize: 20 }}>
              Connected
            </h3>
            <p style={{ overflowWrap: "anywhere" }}>{account}</p>
            <p className="label" style={{ margin: "8px 0" }}>
              {chain.chainName.toUpperCase()}
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
        {step === "error" && (
          <>
            <h3 id="wallet-title" style={{ fontSize: 20 }}>
              Could not connect
            </h3>
            <p role="alert">{failure}</p>
            <button type="button" className={ui.btn} onClick={connect}>
              Try again
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
