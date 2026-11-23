import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "../../components/CopyButton";
import { DataTable, SampleTag } from "../../components/primitives";
import { StatusChip } from "../../components/StatusChip";
import ui from "../../components/ui.module.css";

export const metadata: Metadata = { title: "Data & API" };

const ENDPOINTS = [
  [
    "GET /v1/index",
    `{
  "methodologyVersion": "1.0",
  "indexes": [{ "id": "GRI-H100", "value": "2.410000", "status": "LIVE" }]
}`,
  ],
  [
    "GET /v1/index/GRI-H100/history?from=2026-11-20T00:00:00Z&to=2026-11-21T00:00:00Z&interval=1h",
    `{
  "methodologyVersion": "1.0",
  "id": "GRI-H100",
  "points": [{ "t": "2026-11-20T00:00:00Z", "value": "2.398000", "stale": false }]
}`,
  ],
  [
    "GET /v1/index/GRI-H100/sources?at=2026-11-21T08:00:00Z",
    `{
  "methodologyVersion": "1.0",
  "sources": [{ "name": "Source 01", "price": "2.41", "included": true }]
}`,
  ],
  [
    "GET /v1/methodology",
    `{
  "version": "1.0"
}`,
  ],
] as const;

const SOURCE_CLASSES = [
  "H100, H200",
  "H100, A100",
  "H100, H200, B200",
  "H100, H200, A100",
  "H200, B200",
  "A100, RTX 4090",
  "RTX 4090",
];

export default function DataPage() {
  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> DATA &amp; API
      </p>
      <h1>
        Data and API<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        Read-only v1 endpoints. Responses below are <SampleTag /> Cursor
        pagination, errors as <code>{'{"error":{"code","message"}}'}</code>, 60
        requests per minute per IP.
      </p>
      {ENDPOINTS.map(([title, body]) => {
        const text = `${title}\n\n${body}`;
        return (
          <div key={title}>
            <h3
              style={{
                margin: "36px 0 10px",
                fontSize: 15,
                wordBreak: "break-all",
              }}
            >
              {title}
            </h3>
            <pre className={ui.code}>
              <code>{text}</code>
            </pre>
            <CopyButton text={text} />
          </div>
        );
      })}
      <div style={{ marginTop: 40 }}>
        <DataTable
          caption={
            <>
              Sources <SampleTag />
            </>
          }
        >
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">GPU classes</th>
              <th scope="col">Redistribution</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_CLASSES.map((g, i) => (
              <tr key={g + String(i)}>
                <td>Source 0{i + 1}</td>
                <td>{g}</td>
                <td>to be verified</td>
                <td>
                  <StatusChip status={i === 6 ? "STALE" : "LIVE"} />
                </td>
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
