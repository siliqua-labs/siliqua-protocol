export const SAMPLE_STRIP = "SAMPLE DATA · MARKETS NOT LIVE";
export const TESTNET_STRIP = "TESTNET · TEST TOKENS ONLY";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The text of the strip above the header, or null for none. It follows the same condition the
 * pages use to decide between live and sample markets, and never throws, because the layout
 * renders it on every page. Mainnet shows no strip yet: that wording waits for legal review.
 */
export function siteStrip(env: Env): string | null {
  const live =
    Boolean(env.API_BASE_URL) &&
    Boolean(env.CHAIN_ENV) &&
    Boolean(env.RPC_URL) &&
    Boolean(env.FACTORY_ADDRESS);
  if (!live) return SAMPLE_STRIP;
  if (env.CHAIN_ENV === "testnet") return TESTNET_STRIP;
  if (env.CHAIN_ENV === "mainnet") return null;
  // An unknown CHAIN_ENV makes the market pages fail; do not claim anything here.
  return SAMPLE_STRIP;
}
