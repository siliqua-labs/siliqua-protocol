"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import {
  marketAbi,
  STATUS_OPEN,
  STATUS_SETTLED,
  STATUS_VOID,
} from "../lib/marketAbi";
import { formatUnitsText } from "../lib/tradeMath";
import {
  connectWallet,
  errorText,
  explorerTx,
  isRejection,
  type LiveConfig,
  UserError,
  useAccount,
  walletClients,
} from "../lib/wallet";
import { StatusText } from "./StatusText";
import ui from "./ui.module.css";

type Holding = {
  state: number;
  expired: boolean;
  yes: bigint;
  no: bigint;
  claimable: bigint;
};

export function LivePosition({
  market,
  config,
}: {
  market: Address;
  config: LiveConfig;
}) {
  const account = useAccount();
  const [holding, setHolding] = useState<Holding | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!account) return;
    const { publicClient } = await walletClients(config);
    const [state, expiresAt, yes, no, claimable, block] = await Promise.all([
      publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "status",
      }),
      publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "expiresAt",
      }),
      publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "yesStake",
        args: [account],
      }),
      publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "noStake",
        args: [account],
      }),
      publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "claimable",
        args: [account],
      }),
      publicClient.getBlock(),
    ]);
    setHolding({
      state,
      // An open market past its expiry turns void on the first refund call.
      expired: state === STATUS_OPEN && block.timestamp >= expiresAt,
      yes,
      no,
      claimable,
    });
  }, [account, config, market]);

  useEffect(() => {
    refresh().catch((error) => {
      setFailed(!isRejection(error));
      setStatus(errorText(error));
    });
  }, [refresh]);

  async function send(functionName: "claim" | "refundIfVoid") {
    if (!account) return;
    setBusy(true);
    setFailed(false);
    try {
      const { publicClient, walletClient, chain } = await walletClients(config);
      const { request } = await publicClient.simulateContract({
        account,
        address: market,
        abi: marketAbi,
        functionName,
      });
      setStatus("Confirm in your wallet.");
      const hash = await walletClient.writeContract({ ...request, chain });
      setStatus("Waiting for confirmation…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new UserError("The transaction failed on chain.");
      setStatus(`Confirmed: ${explorerTx(config, hash)}`);
      await refresh();
    } catch (error) {
      setFailed(!isRejection(error));
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setFailed(false);
    try {
      await connectWallet(config);
      setStatus("");
    } catch (error) {
      setFailed(!isRejection(error));
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <div className={ui.card}>
        <p>Connect a wallet to see your position.</p>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${ui.small}`}
          disabled={busy}
          onClick={connect}
        >
          {busy ? "Connecting…" : "Connect wallet"}
        </button>
        <p className={ui.status} role="status">
          {failed ? "■ " : ""}
          <StatusText status={status} />
        </p>
      </div>
    );
  }

  const fmt = (v: bigint) =>
    `${formatUnitsText(v, config.decimals)} ${config.tokenSymbol}`;
  const refundable =
    holding !== null &&
    (holding.state === STATUS_VOID || holding.expired) &&
    (holding.yes > 0n || holding.no > 0n);
  const claimableNow =
    holding !== null &&
    holding.state === STATUS_SETTLED &&
    holding.claimable > 0n;

  return (
    <div className={ui.card}>
      {holding === null ? (
        <p>
          {status
            ? "Your position is not loaded. Reload the page to try again."
            : "Loading your position…"}
        </p>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            Staked: YES {fmt(holding.yes)} · NO {fmt(holding.no)}
          </p>
          {holding.state === STATUS_SETTLED ? (
            <p>Claimable: {fmt(holding.claimable)}</p>
          ) : null}
          {refundable ? (
            <p>Refundable: {fmt(holding.yes + holding.no)}</p>
          ) : null}
          {claimableNow ? (
            <button
              type="button"
              className={`${ui.btn} ${ui.primary} ${ui.small}`}
              disabled={busy}
              onClick={() => send("claim")}
            >
              Claim
            </button>
          ) : null}
          {refundable ? (
            <button
              type="button"
              className={`${ui.btn} ${ui.primary} ${ui.small}`}
              disabled={busy}
              onClick={() => send("refundIfVoid")}
            >
              Refund
            </button>
          ) : null}
          {!claimableNow && !refundable ? (
            <p style={{ fontSize: 12 }}>Nothing to collect yet.</p>
          ) : null}
        </>
      )}
      <p className={ui.status} role="status">
        {failed ? "■ " : ""}
        <StatusText status={status} />
      </p>
    </div>
  );
}
