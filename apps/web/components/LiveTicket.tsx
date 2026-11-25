"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { erc20Abi, marketAbi, pauseAbi, STATUS_OPEN } from "../lib/marketAbi";
import {
  estimatePayout,
  formatUnitsText,
  parseStake,
  remainingCap,
} from "../lib/tradeMath";
import {
  connectWallet,
  errorText,
  explorerTx,
  type LiveConfig,
  useAccount,
  walletClients,
} from "../lib/wallet";
import { StatusText } from "./StatusText";
import ui from "./ui.module.css";

type Side = "YES" | "NO";
type Position = {
  balance: bigint;
  allowance: bigint;
  used: bigint;
  open: boolean;
  paused: boolean;
};

export function LiveTicket({
  market,
  config,
  cap,
  yesPool,
  noPool,
}: {
  market: Address;
  config: LiveConfig;
  // Base units, from the API; the contract enforces the cap, this only informs.
  cap: string;
  yesPool: string;
  noPool: string;
}) {
  const account = useAccount();
  const [side, setSide] = useState<Side>("YES");
  const [amount, setAmount] = useState("10");
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const symbol = config.tokenSymbol;

  const refresh = useCallback(async () => {
    if (!account) return;
    const { publicClient } = await walletClients(config);
    const pauseSource = await publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "pauseSource",
    });
    const [balance, allowance, yes, no, state, paused] = await Promise.all([
      publicClient.readContract({
        address: config.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
      publicClient.readContract({
        address: config.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, market],
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
        functionName: "status",
      }),
      publicClient.readContract({
        address: pauseSource,
        abi: pauseAbi,
        functionName: "paused",
      }),
    ]);
    setPosition({
      balance,
      allowance,
      used: yes + no,
      open: state === STATUS_OPEN,
      paused,
    });
  }, [account, config, market]);

  useEffect(() => {
    refresh().catch((error) => {
      setFailed(true);
      setStatus(errorText(error));
    });
  }, [refresh]);

  const capBase = BigInt(cap);
  const room = position ? remainingCap(capBase, position.used, 0n) : capBase;
  const stake = parseStake(amount, config.decimals);
  const own = BigInt(side === "YES" ? yesPool : noPool);
  const other = BigInt(side === "YES" ? noPool : yesPool);
  const estimate =
    stake === null ? null : estimatePayout(stake, own, other, config.feeBps);

  let blocker: string | null = null;
  if (stake === null) {
    blocker = `Enter an amount with up to ${config.decimals} decimals.`;
  } else if (position) {
    if (!position.open) blocker = "This market is no longer open.";
    else if (position.paused) blocker = "Buying is paused.";
    else if (stake > room) {
      blocker = `Over your remaining cap of ${formatUnitsText(room, config.decimals)} ${symbol}.`;
    } else if (stake > position.balance) {
      blocker = `Your balance is ${formatUnitsText(position.balance, config.decimals)} ${symbol}.`;
    }
  }

  async function buy() {
    if (!account || stake === null) return;
    setBusy(true);
    setFailed(false);
    try {
      const { publicClient, walletClient, chain } = await walletClients(config);
      if ((position?.allowance ?? 0n) < stake) {
        setStatus(
          "Approve in your wallet: exactly this amount, not unlimited.",
        );
        const approval = await walletClient.writeContract({
          chain,
          account,
          address: config.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [market, stake],
        });
        setStatus("Waiting for the approval to confirm…");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: approval,
        });
        if (receipt.status !== "success") throw new Error("Approval reverted.");
      }
      const { request } = await publicClient.simulateContract({
        account,
        address: market,
        abi: marketAbi,
        functionName: "buy",
        args: [side === "YES", stake],
      });
      setStatus("Confirm the buy in your wallet.");
      const hash = await walletClient.writeContract({ ...request, chain });
      setStatus("Waiting for the buy to confirm…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Buy reverted.");
      setStatus(`Confirmed: ${explorerTx(config, hash)}`);
      await refresh();
    } catch (error) {
      setFailed(true);
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function getTestTokens() {
    if (!account) return;
    setBusy(true);
    setFailed(false);
    try {
      const { publicClient, walletClient, chain } = await walletClients(config);
      const { request } = await publicClient.simulateContract({
        account,
        address: config.token,
        abi: erc20Abi,
        functionName: "faucet",
      });
      setStatus("Confirm in your wallet to receive free test tokens.");
      const hash = await walletClient.writeContract({ ...request, chain });
      setStatus("Waiting for the tokens…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Faucet reverted.");
      setStatus(`Test tokens received: ${explorerTx(config, hash)}`);
      await refresh();
    } catch (error) {
      setFailed(true);
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
      setFailed(true);
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={ui.card}>
      <p className="label">
        Ticket · {config.chainName}, {symbol}
      </p>
      {account ? (
        <>
          <div className={ui.tabs} role="toolbar" aria-label="Side">
            {(["YES", "NO"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`${ui.btn} ${ui.small} ${s === side ? ui.primary : ""}`}
                aria-pressed={s === side}
                onClick={() => setSide(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <label className="label" htmlFor="ticket-amount">
            Amount ({symbol})
          </label>
          <br />
          <input
            id="ticket-amount"
            className={ui.input}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={stake === null}
          />
          <p style={{ marginTop: 10, color: "var(--tx)" }} aria-live="polite">
            {estimate === null
              ? `Enter an amount with up to ${config.decimals} decimals.`
              : `Estimated payout if ${side} wins: ${formatUnitsText(estimate, config.decimals)} ${symbol}`}
          </p>
          <p style={{ fontSize: 12 }}>
            Estimate if the pools stay as they are. Includes your stake and the{" "}
            {config.feeBps / 100}% fee on the losing pool.
            {position
              ? ` Balance ${formatUnitsText(position.balance, config.decimals)} ${symbol}, room under the cap ${formatUnitsText(room, config.decimals)}.`
              : ""}
          </p>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${ui.small}`}
            disabled={busy || blocker !== null}
            onClick={buy}
          >
            {position && stake !== null && position.allowance < stake
              ? "Approve and buy"
              : "Buy"}
          </button>
          {blocker ? (
            <p style={{ fontSize: 12, marginTop: 8 }}>{blocker}</p>
          ) : null}
          {config.testFaucet ? (
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Testnet only: no test {symbol}?{" "}
              <button
                type="button"
                className={`${ui.btn} ${ui.small}`}
                disabled={busy}
                onClick={getTestTokens}
              >
                Get free test {symbol}
              </button>
            </p>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${ui.small}`}
          disabled={busy}
          onClick={connect}
        >
          Connect wallet
        </button>
      )}
      <p className="label" style={{ marginTop: 10 }} role="status">
        {failed ? "■ " : ""}
        <StatusText status={status} />
      </p>
    </div>
  );
}
