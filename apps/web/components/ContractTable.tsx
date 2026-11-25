import { chains } from "@siliqua/chain";
import { describeVerification, verificationFor } from "../lib/verification";
import { DataTable } from "./primitives";

export type ContractRow = { name: string; address: string | null };

/** Rows with real addresses, linked to the explorer, and a verification status from Sourcify. */
export async function ContractTable({
  caption,
  chainEnv,
  rows,
}: {
  caption: string;
  chainEnv: "testnet" | "mainnet" | null;
  rows: ContractRow[];
}) {
  const explorer = chainEnv ? chains[chainEnv].explorerUrl.value : null;
  const statuses = await Promise.all(
    rows.map((r) =>
      chainEnv && r.address
        ? verificationFor(chainEnv, r.address)
        : Promise.resolve(null),
    ),
  );
  return (
    <DataTable caption={caption}>
      <thead>
        <tr>
          <th scope="col">Contract</th>
          <th scope="col">Address</th>
          <th scope="col">Source verification</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name}>
            <td>{r.name}</td>
            <td>
              {r.address && explorer ? (
                <a href={`${explorer}/address/${r.address}`}>{r.address}</a>
              ) : (
                "not deployed"
              )}
            </td>
            <td>{statuses[i] ? describeVerification(statuses[i]) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
