import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "../../../components/CopyButton";
import { SourceSpread } from "../../../components/charts";
import { GpuHistory } from "../../../components/GpuHistory";
import { DataTable, Notice, SampleTag } from "../../../components/primitives";
import { StatusChip } from "../../../components/StatusChip";
import ui from "../../../components/ui.module.css";
import { getIndexDetail, getIndexes } from "../../../lib/api/client";
import {
  changeTone,
  formatChange,
  formatUsd,
  formatUtc,
} from "../../../lib/format";

type Params = { class: string };

export async function generateStaticParams(): Promise<Params[]> {
  const { indexes } = await getIndexes();
  return indexes.map((i) => ({ class: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { class: slug } = await params;
  const d = await getIndexDetail(slug);
  return { title: d ? d.index.indexId : "Index not found" };
}

export default async function GpuPage({ params }: { params: Promise<Params> }) {
  const { class: slug } = await params;
  const d = await getIndexDetail(slug);
  if (!d) notFound();
  const { index: i } = d;
  const published = i.status !== "INSUFFICIENT_SOURCES";
  const api = `GET /v1/indexes/${i.slug}

${JSON.stringify(
  {
    indexId: i.indexId,
    valueMicroUsd: i.valueMicroUsd,
    status: i.status,
    validSources: i.validSources,
    updatedAt: i.updatedAt,
    methodologyVersion: d.methodologyVersion,
  },
  null,
  2,
)}`;
  return (
    <div className={ui.page}>
      <Link className="label" href="/">
        ← Indexes
      </Link>
      {d.isSample && (
        <p className="label" style={{ marginTop: 20 }}>
          <SampleTag />
        </p>
      )}
      <h1>
        {i.indexId}
        <span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <div className={ui.spec}>
        <div>
          <span className="label">Value · USD/GPU-hr</span>
          <b>
            {formatUsd(i.valueMicroUsd)}
            {published || !i.valueMicroUsd ? "" : " (last)"}
          </b>
        </div>
        <div>
          <span className="label">24h</span>
          <b className={changeTone(i.change24hBps)}>
            {formatChange(i.change24hBps)}
          </b>
        </div>
        {/* The API sends null until seven days of hourly history exist. */}
        {i.change7dBps !== null && (
          <div>
            <span className="label">7d</span>
            <b className={changeTone(i.change7dBps)}>
              {formatChange(i.change7dBps)}
            </b>
          </div>
        )}
      </div>
      <p style={{ marginTop: 16 }}>
        <StatusChip status={i.status} /> &nbsp; Updated {formatUtc(i.updatedAt)}{" "}
        · Methodology v{d.methodologyVersion} DRAFT
      </p>
      {i.status === "STALE" && (
        <Notice>
          ▲ STALE · Last print {formatUtc(i.updatedAt)}. Hours after that are
          skipped in the TWAP and counted as stale. Dashed segments in the chart
          are stale hours.
        </Notice>
      )}
      {!published && (
        <Notice tone="danger">
          ■ INSUFFICIENT SOURCES · Only {i.validSources} valid sources after the
          outlier filter. At least {i.minValidSources} are required, so no new
          value is published.{" "}
          {i.valueMicroUsd
            ? `The last value (${formatUsd(i.valueMicroUsd)}, ${formatUtc(i.updatedAt)}) is stale and shown for reference only.`
            : "No value has been published yet."}
        </Notice>
      )}

      <h3 className={ui.h3}>Price history</h3>
      <GpuHistory
        indexId={i.indexId}
        points={d.history.points}
        endAt={d.history.endAt}
        isSample={d.isSample}
      />

      <h3 className={ui.h3}>Spread across sources</h3>
      <SourceSpread sources={d.sources} medianMicroUsd={d.medianMicroUsd} />

      <div className={ui.grid2} style={{ marginTop: 24 }}>
        <div className={ui.card}>
          <p className="label">Valid sources after outlier filter</p>
          <b className={ui.big}>
            {i.validSources}{" "}
            <span style={{ color: "var(--dim)" }}>
              of {i.minValidSources} minimum
            </span>
          </b>
          <div
            style={{ display: "flex", gap: 4, marginTop: 10 }}
            role="img"
            aria-label={`${i.validSources} valid of ${d.reportingSources} reporting`}
          >
            {d.sources.map((s) => (
              <i
                key={s.name}
                style={{
                  flex: 1,
                  height: 10,
                  ...(s.included
                    ? {
                        background:
                          i.validSources < i.minValidSources
                            ? "var(--dn)"
                            : "var(--em)",
                      }
                    : { border: "1px solid var(--dn)" }),
                }}
              />
            ))}
          </div>
        </div>
        <div className={ui.card}>
          <p className="label">24-hour TWAP · market settlement value</p>
          <b className={ui.big}>
            {d.twap24hMicroUsd
              ? formatUsd(d.twap24hMicroUsd, 4)
              : "Not published"}
          </b>
          <p style={{ margin: "8px 0 0", fontSize: 13 }}>
            Average of hourly prints over 24 hours. Stale hours are skipped and
            counted.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <DataTable caption={<>Sources {d.isSample ? <SampleTag /> : null}</>}>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Price (USD/hr)</th>
              <th scope="col">Status</th>
              <th scope="col">Last fetched</th>
            </tr>
          </thead>
          <tbody>
            {d.sources.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{formatUsd(s.priceMicroUsd)}</td>
                <td>{s.included ? "● included" : "○ excluded"}</td>
                <td>{formatUtc(s.fetchedAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <h3 className={ui.h3}>API</h3>
      <pre className={ui.code}>
        <code>{api}</code>
      </pre>
      <CopyButton text={api} />
    </div>
  );
}
