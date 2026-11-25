import { chains } from "@siliqua/chain";

export type Verification = "verified" | "partial" | "not verified" | "unknown";
export type Verifier = "Sourcify" | "Blockscout";
export type VerifierResult = { verifier: Verifier; result: Verification };

const SOURCIFY = "https://sourcify.dev/server/v2/contract";

/** Sourcify answers 404, or 200 with a null match, for a contract it has never verified. */
export function sourcifyResult(
  status: number,
  body: { match?: string | null } | null,
): Verification {
  if (status === 404) return "not verified";
  if (status !== 200 || !body) return "unknown";
  if (body.match === "match" || body.match === "exact_match") return "verified";
  return body.match === null || body.match === undefined
    ? "not verified"
    : "unknown";
}

/** A partial match is the best a build with bytecode hash none can get on Blockscout. */
export function blockscoutResult(
  status: number,
  body: {
    is_verified?: boolean | null;
    is_fully_verified?: boolean | null;
  } | null,
): Verification {
  if (status === 404) return "not verified";
  if (status !== 200 || !body) return "unknown";
  if (body.is_fully_verified) return "verified";
  return body.is_verified ? "partial" : "not verified";
}

async function check(
  url: string,
  label: string,
  parse: (status: number, body: never) => Verification,
): Promise<Verification> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    const body = res.ok ? await res.json() : null;
    return parse(res.status, body as never);
  } catch (error) {
    console.error(`${label} check failed for ${url}`, error);
    return "unknown";
  }
}

export async function verificationFor(
  chainEnv: "testnet" | "mainnet",
  address: string,
): Promise<VerifierResult[]> {
  const chain = chains[chainEnv];
  const [sourcify, blockscout] = await Promise.all([
    check(
      `${SOURCIFY}/${chain.chainId.value}/${address}`,
      "sourcify",
      sourcifyResult,
    ),
    check(
      `${chain.explorerUrl.value}/api/v2/smart-contracts/${address}`,
      "blockscout",
      blockscoutResult,
    ),
  ]);
  return [
    { verifier: "Sourcify", result: sourcify },
    { verifier: "Blockscout", result: blockscout },
  ];
}

/** One line for the table: what is verified where, or why that is not known. */
export function describeVerification(results: VerifierResult[]): string {
  const good = results
    .filter((r) => r.result === "verified" || r.result === "partial")
    .map((r) =>
      r.result === "partial" ? `${r.verifier} (partial)` : r.verifier,
    );
  if (good.length > 0) return `verified on ${good.join(", ")}`;
  if (results.some((r) => r.result === "unknown"))
    return "unknown, check the explorer";
  return "not verified";
}
