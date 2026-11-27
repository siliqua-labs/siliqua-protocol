import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "../../components/CopyButton";
import { DataTable, SampleTag } from "../../components/primitives";
import ui from "../../components/ui.module.css";
import { getIndexDetail, getIndexes } from "../../lib/api/client";
import { formatUtc } from "../../lib/format";

export const metadata: Metadata = { title: "Data & API" };

const ROUTES = [
  ["GET /v1/indexes", "Every index with its latest value, changes and status."],
  [
    "GET /v1/indexes/{slug}",
    "One index: hourly history, the sources behind the latest hour, median and 24-hour TWAP.",
  ],
  ["GET /v1/narratives", "Daily CMI shares and the top posts by credibility."],
  ["GET /v1/markets", "Markets read from the factory contract."],
  ["GET /v1/markets/{address}", "One market by contract address."],
  ["GET /v1/oracle", "Operators, recent slots and rejected reports."],
] as const;

export default async function DataPage() {
  const list = await getIndexes();
  const details = await Promise.all(
    list.indexes.map((i) => getIndexDetail(i.slug)),
  );
  const first = details.find((d) => d !== null);

  const providers = new Map<string, { classes: string[]; fetchedAt: string }>();
  for (const detail of details) {
    if (!detail) continue;
    for (const source of detail.sources) {
      const entry = providers.get(source.name) ?? {
        classes: [],
        fetchedAt: source.fetchedAt,
      };
      entry.classes.push(detail.index.indexId);
      if (source.fetchedAt > entry.fetchedAt)
        entry.fetchedAt = source.fetchedAt;
      providers.set(source.name, entry);
    }
  }

  const listExample = `GET /v1/indexes\n\n${JSON.stringify(
    {
      methodologyVersion: list.methodologyVersion,
      isSample: list.isSample,
      indexes: list.indexes.slice(0, 1),
    },
    null,
    2,
  )}`;
  const detailExample = first
    ? `GET /v1/indexes/${first.index.slug}\n\n${JSON.stringify(
        {
          methodologyVersion: first.methodologyVersion,
          isSample: first.isSample,
          index: first.index,
          history: {
            endAt: first.history.endAt,
            points: first.history.points.slice(-2),
          },
          reportingSources: first.reportingSources,
          sources: first.sources.slice(0, 2),
          medianMicroUsd: first.medianMicroUsd,
          twap24hMicroUsd: first.twap24hMicroUsd,
        },
        null,
        2,
      )}`
    : null;

  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> DATA &amp; API
      </p>
      <h1>
        Data and API<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        Read-only v1 endpoints, open to any origin. Errors come as{" "}
        <code>{'{"error":{"code","message"}}'}</code>, 60 requests per minute
        per IP. Prices are integer micro-USD strings: 1,000,000 is one US
        dollar. {list.isSample ? <SampleTag /> : null}
      </p>

      <div style={{ marginTop: 32 }}>
        <DataTable caption="Endpoints">
          <thead>
            <tr>
              <th scope="col">Route</th>
              <th scope="col">Returns</th>
            </tr>
          </thead>
          <tbody>
            {ROUTES.map(([route, text]) => (
              <tr key={route}>
                <td>{route}</td>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      {[listExample, detailExample].map((text) =>
        text ? (
          <div key={text.split("\n")[0]}>
            <h3 style={{ margin: "36px 0 10px", fontSize: 15 }}>
              {text.split("\n")[0]}
            </h3>
            <pre className={ui.code}>
              <code>{text}</code>
            </pre>
            <CopyButton text={text} />
          </div>
        ) : null,
      )}

      <div style={{ marginTop: 40 }}>
        <DataTable
          caption={<>Sources {first?.isSample ? <SampleTag /> : null}</>}
        >
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Indexes</th>
              <th scope="col">Last fetched</th>
              <th scope="col">Redistribution</th>
            </tr>
          </thead>
          <tbody>
            {[...providers.entries()].sort().map(([name, entry]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{entry.classes.join(", ")}</td>
                <td>{formatUtc(entry.fetchedAt)}</td>
                <td>terms not confirmed</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <div className={ui.card} style={{ marginTop: 24 }}>
        <p className="label">Raw data policy</p>
        <p style={{ margin: 0 }}>
          Raw data can be downloaded only for sources whose terms allow it. For
          all other sources, only aggregated values and input hashes are
          published.
        </p>
      </div>
      <p style={{ marginTop: 16 }}>
        Rules: <Link href="/methodology">Methodology</Link> · Signers:{" "}
        <Link href="/oracle">Oracle</Link>
      </p>
    </div>
  );
}
