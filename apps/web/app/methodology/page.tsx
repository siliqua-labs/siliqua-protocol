import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DataTable, Notice } from "../../components/primitives";
import { StatusChip } from "../../components/StatusChip";
import ui from "../../components/ui.module.css";
import { getIndexes } from "../../lib/api/client";
import { METHODOLOGY_VERSION } from "../../lib/api/mock";

export const metadata: Metadata = { title: "Methodology" };

function Formula({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={ui.card} style={{ margin: "12px 0" }}>
      <p className="label" style={{ margin: "0 0 8px" }}>
        {label}
      </p>
      <div style={{ overflowX: "auto" }}>
        <math display="block">{children}</math>
      </div>
    </div>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className={ui.list} style={{ paddingLeft: 20 }}>
      {items.map(([title, text]) => (
        <li key={title}>
          <b>{title}.</b> {text}
        </li>
      ))}
    </ol>
  );
}

export default async function MethodologyPage() {
  const { isSample } = await getIndexes();
  return (
    <div className={ui.page}>
      <p className="label">
        <b style={{ color: "var(--em)" }}>■</b> METHODOLOGY
      </p>
      <h1>
        Built to be recomputed<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        <StatusChip status={isSample ? "NOT_LIVE" : "RUNNING"} /> &nbsp;{" "}
        <span className={ui.tag}>v{METHODOLOGY_VERSION} DRAFT</span>{" "}
        &nbsp;Published rules, sources and weights. Raw inputs are published
        only where source terms allow it, so not every value can be recomputed
        from public data.
      </p>

      <h3 className={ui.h3} id="versions" style={{ marginTop: 48 }}>
        Versions
      </h3>
      <DataTable caption="Version history">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Date (UTC)</th>
            <th scope="col">Status</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>v{METHODOLOGY_VERSION} DRAFT</td>
            <td>2026-11-21</td>
            <td>Draft</td>
            <td>First published rules for GRI and CMI.</td>
          </tr>
          <tr>
            <td>v{METHODOLOGY_VERSION} DRAFT</td>
            <td>2026-11-26</td>
            <td>Amendment</td>
            <td>
              GRI combines the filtered sources by median instead of mean.
              Applied on testnet without the 14-day notice.
            </td>
          </tr>
        </tbody>
      </DataTable>
      <p style={{ marginTop: 16 }}>
        Changes are announced 14 days before they take effect.
      </p>
      <Notice>
        Emergency procedure: if a source goes offline suddenly, it may be
        removed at once. The change is logged separately with the reason and the
        time, and the 14-day rule is skipped for that change only.
      </Notice>

      <h3 className={ui.h3} id="gri" style={{ marginTop: 48 }}>
        GRI · GPU Rent Index
      </h3>
      <Steps
        items={[
          [
            "Unit",
            "One GPU, in USD, on-demand. No spot or interruptible prices. No long-term contract discounts.",
          ],
          ["Sample", "Every 10 minutes, one price per source."],
          [
            "Hourly value",
            "Per source, the median of its 10-minute samples in that hour. The index is the median of the source values that pass the outlier filter, rounded half up.",
          ],
          [
            "Outlier filter",
            "A source is dropped when its distance from the median exceeds the bound below.",
          ],
          [
            "Minimum",
            "At least 5 valid sources per GPU class after the filter. Fewer means no value is published for that hour and the last one is marked stale.",
          ],
          [
            "Weights",
            "Every source has weight 1 in v1. The weight function is selected by methodology version.",
          ],
          [
            "Settlement",
            "TWAP over the hours in the 24-hour window that have a print, rounded half up. Hours with no print are skipped and counted as stale. More than 6 stale hours in the window voids the market.",
          ],
          ["Stale", "An hour with no published print."],
        ]}
      />
      <Formula label="Outlier bound (m = median, MAD = median absolute deviation)">
        <mrow>
          <mo>|</mo>
          <msub>
            <mi>p</mi>
            <mi>s</mi>
          </msub>
          <mo>-</mo>
          <mi>m</mi>
          <mo>|</mo>
          <mo>&gt;</mo>
          <mn>3</mn>
          <mo>×</mo>
          <mo>max</mo>
          <mo>(</mo>
          <mn>1.4826</mn>
          <mo>×</mo>
          <mi>MAD</mi>
          <mo>,</mo>
          <mn>0.01</mn>
          <mo>×</mo>
          <mi>m</mi>
          <mo>)</mo>
        </mrow>
      </Formula>
      <Formula label="TWAP (P = hours in the window with a print)">
        <mrow>
          <mi>TWAP</mi>
          <mo>=</mo>
          <mfrac>
            <mrow>
              <msub>
                <mo>∑</mo>
                <mrow>
                  <mi>h</mi>
                  <mo>∈</mo>
                  <mi>P</mi>
                </mrow>
              </msub>
              <msub>
                <mi>I</mi>
                <mi>h</mi>
              </msub>
            </mrow>
            <mrow>
              <mo>|</mo>
              <mi>P</mi>
              <mo>|</mo>
            </mrow>
          </mfrac>
        </mrow>
      </Formula>

      <h3 className={ui.h3} id="cmi" style={{ marginTop: 48 }}>
        CMI · Compute Mindshare Index
      </h3>
      <Formula label="Raw weight, narrative n, day d">
        <mrow>
          <msub>
            <mi>raw</mi>
            <mi>n</mi>
          </msub>
          <mo>=</mo>
          <mo>∑</mo>
          <msub>
            <mi>c</mi>
            <mi>k</mi>
          </msub>
          <mo>·</mo>
          <msup>
            <mi>e</mi>
            <mrow>
              <mo>-</mo>
              <mi>λ</mi>
              <mi>Δt</mi>
            </mrow>
          </msup>
        </mrow>
      </Formula>
      <Formula label="Normalisation">
        <mrow>
          <msub>
            <mi>CMI</mi>
            <mi>n</mi>
          </msub>
          <mo>=</mo>
          <mn>10000</mn>
          <mo>×</mo>
          <mfrac>
            <msub>
              <mi>raw</mi>
              <mi>n</mi>
            </msub>
            <mrow>
              <mo>∑</mo>
              <msub>
                <mi>raw</mi>
                <mi>m</mi>
              </msub>
            </mrow>
          </mfrac>
        </mrow>
      </Formula>
      <Steps
        items={[
          [
            "c",
            "Credibility of the account, from 0 to 1, built from account age, bot score and an owner-maintained tier list.",
          ],
          [
            "Decay",
            "Half-life 48 hours, so lambda = ln(2) / 48 h. dt is measured from the end of the UTC day. Lookback is 7 days.",
          ],
          [
            "Label",
            "One post counts for one narrative, the highest-scoring one. Posts below the entry threshold go to OTHER.",
          ],
          [
            "Rounding",
            "Largest remainder, so the five narratives and OTHER sum to exactly 10,000 bps.",
          ],
          [
            "Zero day",
            "A day with zero raw weight is not published and is marked stale.",
          ],
        ]}
      />
      <p style={{ fontSize: 13 }}>
        Published per post: post ID, label, bot score and model hash. Post text
        is never published.
      </p>

      <h3 className={ui.h3} id="oracle" style={{ marginTop: 48 }}>
        Oracle report
      </h3>
      <p>
        Each operator signs its own value (EIP-712: index, timestamp, value,
        sources, methodology version, nonce). The contract drops values that
        deviate from the median by more than the tolerance (1%, a parameter),
        needs at least 2 values left, and stores the median. With 2 values, it
        stores their mean, rounded half up. Every per-operator value is emitted
        in an event. Late reports are accepted for up to 3 hours.
      </p>

      <h3 className={ui.h3} id="limits" style={{ marginTop: 48 }}>
        Limitations
      </h3>
      <div className={ui.card}>
        <ul className={ui.list}>
          <li>
            GRI uses provider listing prices, not executed transaction prices.
          </li>
          <li>Data quality differs between providers.</li>
          <li>
            In v1 the oracle has three operators, all from the Siliqua team, so
            they are not independent. There is no stake and no slashing.
          </li>
          <li>CMI labelling is not third-party reproducible.</li>
          <li>Social platforms can limit or remove access to their data.</li>
        </ul>
      </div>
      <p style={{ marginTop: 16 }}>
        Sources: <Link href="/data">Data &amp; API</Link>. Operators:{" "}
        <Link href="/oracle">Oracle</Link>.
      </p>
    </div>
  );
}
