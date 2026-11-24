// A value with `verified: false` has not been matched against an official source and must not be
// used to move money. Checked on 2026-11-24 against docs.robinhood.com/chain/connecting and the
// testnet Blockscout API.
export type Checked<T> = { value: T; verified: boolean; source: string };

export type ChainConfig = {
  name: string;
  chainId: Checked<number>;
  publicRpcUrl: Checked<string>;
  explorerUrl: Checked<string>;
  nativeSymbol: Checked<string>;
  // null until an address is confirmed for this network; never guessed.
  token: {
    symbol: string;
    address: Checked<`0x${string}`> | null;
    // What the contract returned when the address was verified; services still read decimals()
    // at startup and stop on a mismatch.
    expectedDecimals: number | null;
  };
};

const CONNECTING = "https://docs.robinhood.com/chain/connecting/";

export const chains = {
  testnet: {
    name: "Robinhood Chain Testnet",
    chainId: { value: 46630, verified: true, source: CONNECTING },
    publicRpcUrl: {
      value: "https://rpc.testnet.chain.robinhood.com",
      verified: true,
      source: CONNECTING,
    },
    explorerUrl: {
      value: "https://explorer.testnet.chain.robinhood.com",
      verified: true,
      source: CONNECTING,
    },
    nativeSymbol: { value: "ETH", verified: true, source: CONNECTING },
    token: {
      symbol: "tUSDG",
      address: {
        value: "0x3A37C1D137e02e04E1CC1e4a7dB0B4628C762b4e",
        // Given by the owner and matched on the testnet explorer: verified contract, ERC-20,
        // symbol tUSDG, 6 decimals. Not an official Robinhood token; created by 0x1f4c...462D.
        verified: true,
        source:
          "https://explorer.testnet.chain.robinhood.com/address/0x3A37C1D137e02e04E1CC1e4a7dB0B4628C762b4e",
      },
      expectedDecimals: 6,
    },
  },
  mainnet: {
    name: "Robinhood Chain",
    chainId: { value: 4663, verified: true, source: CONNECTING },
    publicRpcUrl: {
      value: "https://rpc.mainnet.chain.robinhood.com",
      verified: true,
      source: CONNECTING,
    },
    explorerUrl: {
      value: "https://robinhoodchain.blockscout.com",
      verified: true,
      source: CONNECTING,
    },
    nativeSymbol: { value: "ETH", verified: true, source: CONNECTING },
    token: {
      symbol: "USDG",
      address: {
        value: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
        // Listed on the Robinhood docs contracts page without a network label (page URL not recorded). Read from the verified
        // mainnet RPC (chain 4663) on 2026-11-24: a contract named Global Dollar, symbol USDG,
        // 6 decimals. The other address the owner named, 0xe343...491d, has no code on this chain.
        verified: true,
        source:
          "https://rpc.mainnet.chain.robinhood.com (eth_call name, symbol, decimals)",
      },
      expectedDecimals: 6,
    },
  },
} as const satisfies Record<string, ChainConfig>;

export type ChainName = keyof typeof chains;

/** The token address, or an error: nothing may send funds with an unverified or missing token. */
export function verifiedToken(name: ChainName): `0x${string}` {
  const address: Checked<`0x${string}`> | null = chains[name].token.address;
  if (!address) throw new Error(`no token address configured for ${name}`);
  if (!address.verified)
    throw new Error(`token address for ${name} is not verified`);
  return address.value;
}

export function assertDecimals(name: ChainName, onChain: number): void {
  const expected = chains[name].token.expectedDecimals;
  if (expected === null)
    throw new Error(`no expected token decimals for ${name}`);
  if (onChain !== expected) {
    throw new Error(
      `token decimals on ${name} are ${onChain}, configuration expects ${expected}`,
    );
  }
}
