"use client";

import { useSyncExternalStore } from "react";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  UserRejectedRequestError,
} from "viem";
import { describeRevert } from "./tradeMath";

// Everything the browser needs to talk to one verified chain and token. Built on the server from
// @siliqua/chain, so a value reaches the wallet only if its flag was set.
export type LiveConfig = {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  token: Address;
  tokenSymbol: string;
  decimals: number;
  feeBps: number;
};

type Eip1193 = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: "accountsChanged", handler: (accounts: string[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

function provider(): Eip1193 {
  if (!window.ethereum) {
    throw new Error(
      "No browser wallet found. Install a wallet extension and reload.",
    );
  }
  return window.ethereum;
}

let current: Address | null = null;
const listeners = new Set<() => void>();
let watching = false;

function setAccount(next: Address | null) {
  current = next;
  for (const listener of listeners) listener();
}

function watch() {
  if (watching || !window.ethereum?.on) return;
  watching = true;
  window.ethereum.on("accountsChanged", (accounts) => {
    const first = accounts[0];
    setAccount(first ? getAddress(first) : null);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  watch();
  // Pick up a wallet the user already authorized, without opening a prompt.
  if (current === null && window.ethereum) {
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const first = (accounts as string[])[0];
        if (first && current === null) setAccount(getAddress(first));
      })
      .catch(() => {
        // Not connected yet; the connect button is the way forward.
      });
  }
  return () => listeners.delete(listener);
}

export function useAccount(): Address | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

async function ensureChain(config: LiveConfig): Promise<void> {
  const p = provider();
  const wanted = `0x${config.chainId.toString(16)}`;
  const have = (await p.request({ method: "eth_chainId" })) as string;
  if (have.toLowerCase() === wanted) return;
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: wanted }],
    });
  } catch (error) {
    // 4902: the wallet does not know this chain yet.
    if ((error as { code?: number }).code !== 4902) throw error;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: wanted,
          chainName: config.chainName,
          rpcUrls: [config.rpcUrl],
          blockExplorerUrls: [config.explorerUrl],
          nativeCurrency: {
            name: config.nativeSymbol,
            symbol: config.nativeSymbol,
            decimals: 18,
          },
        },
      ],
    });
  }
}

export async function connectWallet(config: LiveConfig): Promise<Address> {
  const accounts = (await provider().request({
    method: "eth_requestAccounts",
  })) as string[];
  const first = accounts[0];
  if (!first) throw new Error("The wallet returned no account.");
  await ensureChain(config);
  const account = getAddress(first);
  setAccount(account);
  return account;
}

/** Clients bound to the wallet, after making sure it sits on the right chain. */
export async function walletClients(config: LiveConfig) {
  await ensureChain(config);
  const chain = defineChain({
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: {
      name: config.nativeSymbol,
      symbol: config.nativeSymbol,
      decimals: 18,
    },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const transport = custom(provider());
  return {
    chain,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport }),
  };
}

export function explorerTx(config: LiveConfig, hash: string): string {
  return `${config.explorerUrl}/tx/${hash}`;
}

/** A sentence for the user: a decoded contract error, a rejected prompt, or the raw message. */
export function errorText(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You rejected the request in the wallet.";
    }
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      const known = describeRevert(reverted.data?.errorName);
      if (known) return known;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}
