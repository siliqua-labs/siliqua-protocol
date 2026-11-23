import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type Hex, hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseSignedReport, signerOf, typedDataFor } from "./report.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../test-vectors/oracle-signatures-v1.json", import.meta.url),
    "utf8",
  ),
);
const domain = { chainId: fixture.chainId, oracle: fixture.oracle };

for (const item of fixture.cases) {
  test(`fixture: ${item.name}`, async () => {
    const signed = parseSignedReport({
      report: item.report,
      signature: item.signature,
    });
    assert.equal(
      hashTypedData(typedDataFor(domain, signed.report)),
      item.digest,
    );
    assert.equal(await signerOf(domain, signed), fixture.signer);
    // Deterministic signing: re-signing gives the same bytes, so the file cannot drift unnoticed.
    const account = privateKeyToAccount(fixture.privateKey as Hex);
    assert.equal(
      await account.signTypedData(typedDataFor(domain, signed.report)),
      item.signature,
    );
  });
}
