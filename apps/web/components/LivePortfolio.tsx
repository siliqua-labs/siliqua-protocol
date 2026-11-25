"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import type { Market } from "../lib/api/types";
import { formatUsd } from "../lib/format";
import {
  collectable,
  type Holding,
  hasStake,
  readHolding,
} from "../lib/holding";
import { marketAbi } from "../lib/marketAbi";
import { formatUnitsText } from "../lib/tradeMath";
import {
  connectWallet,
  errorText,
  explorerTx,
  type LiveConfig,
  useAccount,
  walletClients,
} from "../lib/wallet";
import { DataTable } from "./primitives";
import { StatusChip } from "./StatusChip";
import { StatusText } from "./StatusText";
import ui from "./ui.module.css";

type Row = { market: Market; holding: Holding };

export function LivePortfolio({
  markets,
  config,
}: {
  markets: Market[];
  config: LiveConfig;
}) {
  const account = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!account) return;
    const { publicClient } = await walletClients(config);
    const block = await publicClient.getBlock();
    const holdings = await Promise.all(
      markets.map((market) =>
        readHolding(
          publicClient,
          market.id as Address,
          account,
          block.timestamp,
        ),
      ),
    );
    setRows(
      markets
        .map((market, i) => ({ market, holding: holdings[i] as Holding }))
        .filter((r) => hasStake(r.holding)),
    );
  }, [account, config, markets]);

  useEffect(() => {
    refresh().catch((error) => {
      setFailed(true);
      setStatus(errorText(error));
    });
  }, [refresh]);

  async function send(market: Market, functionName: "claim" | "refundIfVoid") {
    if (!account) return;
    setBusy(true);
    setFailed(false);
    try {
      const { publicClient, walletClient, chain } = await walletClients(config);
      const { request } = await publicClient.simulateContract({
        account,
        address: market.id as Address,
        abi: marketAbi,
        functionName,
      });
      setStatus("Confirm in your wallet.");
      const hash = await walletClient.writeContract({ ...request, chain });
      setStatus("Waiting for confirmation…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error("Transaction reverted.");
      setStatus(`Confirmed: ${explorerTx(config, hash)}`);
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

  const fmt = (v: bigint) =>
    `${formatUnitsText(v, config.decimals)} ${config.tokenSymbol}`;

  if (!account) {
    return (
      <div className={ui.card}>
        <p>Connect a wallet to see your positions.</p>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${ui.small}`}
          disabled={busy}
          onClick={connect}
        >
          Connect wallet
        </button>
        <p className="label" role="status">
          {failed ? "■ " : ""}
          <StatusText status={status} />
        </p>
      </div>
    );
  }

  const claimTotal = (rows ?? []).reduce(
    (sum, r) =>
      collectable(r.holding).claim ? sum + r.holding.claimable : sum,
    0n,
  );
  const refundTotal = (rows ?? []).reduce(
    (sum, r) =>
      collectable(r.holding).refund ? sum + r.holding.yes + r.holding.no : sum,
    0n,
  );

  return (
    <>
      {rows === null ? (
        <p>Loading your positions…</p>
      ) : rows.length === 0 ? (
        <div className={ui.card}>
          <p style={{ margin: 0 }}>No positions on this wallet yet.</p>
        </div>
      ) : (
        <>
          <p>
            Claimable: {fmt(claimTotal)} · Refundable: {fmt(refundTotal)}
          </p>
          <DataTable caption="Your positions">
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Position</th>
                <th scope="col">Status</th>
                <th scope="col">Collect</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ market, holding }) => {
                const can = collectable(holding);
                return (
                  <tr key={market.id}>
                    <td>
                      <Link href={`/markets/${market.id}`}>
                        {market.indexLabel ?? "Market"} &gt;{" "}
                        {formatUsd(market.thresholdMicroUsd, 2)}
                      </Link>
                    </td>
                    <td>
                      {holding.yes > 0n ? `YES ${fmt(holding.yes)}` : ""}
                      {holding.yes > 0n && holding.no > 0n ? " · " : ""}
                      {holding.no > 0n ? `NO ${fmt(holding.no)}` : ""}
                    </td>
                    <td>
                      <StatusChip status={market.status} />
                    </td>
                    <td>
                      {can.claim ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.primary} ${ui.small}`}
                          disabled={busy}
                          onClick={() => send(market, "claim")}
                        >
                          Claim {fmt(holding.claimable)}
                        </button>
                      ) : can.refund ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.primary} ${ui.small}`}
                          disabled={busy}
                          onClick={() => send(market, "refundIfVoid")}
                        >
                          Refund {fmt(holding.yes + holding.no)}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </>
      )}
      <p className="label" role="status">
        {failed ? "■ " : ""}
        <StatusText status={status} />
      </p>
    </>
  );
}
