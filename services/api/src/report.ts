import {
  type Address,
  type Hex,
  isHex,
  recoverTypedDataAddress,
  size,
} from "viem";

// docs/spec/oracle-v1.md section 4. Field order is fixed by CLAUDE.md.
export const reportTypes = {
  Report: [
    { name: "indexId", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
    { name: "value", type: "uint256" },
    { name: "sources", type: "uint8" },
    { name: "methodologyVersion", type: "uint32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type Report = {
  indexId: Hex;
  timestamp: bigint;
  value: bigint;
  sources: number;
  methodologyVersion: number;
  nonce: bigint;
};

export type SignedReport = { report: Report; signature: Hex };

export type OracleDomain = { chainId: number; oracle: Address };

// secp256k1 group order; a signature with s above half of it is the malleable twin.
const HALF_ORDER =
  0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;
const MAX_VALUE = 2n ** 128n - 1n;
const UINT64_MAX = 2n ** 64n - 1n;
const UINT32_MAX = 2 ** 32 - 1;
const UINT256_MAX = 2n ** 256n - 1n;

export function typedDataFor(domain: OracleDomain, report: Report) {
  return {
    domain: {
      name: "SiliquaOracle",
      version: "1",
      chainId: domain.chainId,
      verifyingContract: domain.oracle,
    },
    types: reportTypes,
    primaryType: "Report" as const,
    message: report,
  };
}

export class ReportRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function decimalBigint(raw: unknown, field: string): bigint {
  if (typeof raw !== "string" || !/^\d{1,78}$/.test(raw)) {
    throw new ReportRejected(
      "bad_field",
      `${field} must be a decimal string of digits`,
    );
  }
  return BigInt(raw);
}

function boundedInt(raw: unknown, field: string, max: number): number {
  if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > max) {
    throw new ReportRejected(
      "bad_field",
      `${field} must be an integer in 0..${max}`,
    );
  }
  return raw as number;
}

/** Shape check only. Window, methodology and index rules stay with the contract. */
export function parseSignedReport(raw: unknown): SignedReport {
  if (typeof raw !== "object" || raw === null) {
    throw new ReportRejected("bad_field", "report entry must be an object");
  }
  const entry = raw as Record<string, unknown>;
  const body = entry.report as Record<string, unknown> | undefined;
  if (typeof body !== "object" || body === null) {
    throw new ReportRejected("bad_field", "report is required");
  }
  const indexId = body.indexId;
  if (typeof indexId !== "string" || !isHex(indexId) || size(indexId) !== 32) {
    throw new ReportRejected("bad_field", "indexId must be 32 bytes of hex");
  }
  const timestamp = decimalBigint(body.timestamp, "timestamp");
  const value = decimalBigint(body.value, "value");
  const nonce = decimalBigint(body.nonce, "nonce");
  if (timestamp === 0n || timestamp > UINT64_MAX) {
    throw new ReportRejected("bad_field", "timestamp out of range");
  }
  if (value === 0n || value > MAX_VALUE) {
    throw new ReportRejected("bad_field", "value must be in 1..2^128-1");
  }
  if (nonce > UINT256_MAX) {
    throw new ReportRejected("bad_field", "nonce out of range");
  }
  const signature = entry.signature;
  if (
    typeof signature !== "string" ||
    !isHex(signature) ||
    size(signature) !== 65
  ) {
    throw new ReportRejected("bad_signature", "signature must be 65 bytes");
  }
  return {
    report: {
      indexId: indexId.toLowerCase() as Hex,
      timestamp,
      value,
      sources: boundedInt(body.sources, "sources", 255),
      methodologyVersion: boundedInt(
        body.methodologyVersion,
        "methodologyVersion",
        UINT32_MAX,
      ),
      nonce,
    },
    signature: signature.toLowerCase() as Hex,
  };
}

/** The signer of a report, or a rejection if the signature is not canonical. */
export async function signerOf(
  domain: OracleDomain,
  signed: SignedReport,
): Promise<Address> {
  const s = BigInt(`0x${signed.signature.slice(66, 130)}`);
  const v = Number.parseInt(signed.signature.slice(130, 132), 16);
  if (s > HALF_ORDER || (v !== 27 && v !== 28)) {
    throw new ReportRejected(
      "bad_signature",
      "signature is not canonical (low s, v of 27 or 28)",
    );
  }
  try {
    const signer = await recoverTypedDataAddress({
      ...typedDataFor(domain, signed.report),
      signature: signed.signature,
    });
    return signer.toLowerCase() as Address;
  } catch (cause) {
    throw new ReportRejected(
      "bad_signature",
      `signature does not recover: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
