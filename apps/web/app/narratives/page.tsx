import type { Metadata } from "next";
import { NarrativeArea } from "../../components/charts";
import { NarrativeExplorer } from "../../components/NarrativeExplorer";
import { DataTable, Notice, SampleTag } from "../../components/primitives";
import ui from "../../components/ui.module.css";
import { getNarratives } from "../../lib/api/client";
import { NARRATIVES } from "../../lib/api/types";
import { formatBpsPercent } from "../../lib/format";

export const metadata: Metadata = { title: "Narratives" };

export default async function NarrativesPage() {
  const { days, posts, isSample } = await getNarratives();
  const sample = isSample ? <SampleTag /> : null;
  const recent = days.slice(-7).reverse();
  return (
    <div className={ui.page}>
      <div className={`label ${ui.sectionHead}`}>
        <b style={{ color: "var(--em)" }}>CMI</b> / COMPUTE MINDSHARE INDEX
      </div>
      <h1>
        Where attention goes<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <p style={{ marginTop: 20 }}>
        Daily shares of compute narratives. Always 10,000 bps in total. {sample}{" "}
        There is no CMI market in v1.
      </p>
      {days.length === 0 ? (
        <Notice>No CMI day has been computed yet.</Notice>
      ) : (
        <NarrativeExplorer days={days} />
      )}

      <h3 className={ui.h3} style={{ marginTop: 48 }}>
        30 days
      </h3>
      {days.length > 0 && <NarrativeArea days={days} />}
      <details style={{ marginTop: 10 }}>
        <summary className={`${ui.btn} ${ui.small}`}>View as table</summary>
        <div style={{ marginTop: 10 }}>
          <DataTable caption={<>CMI by day, bps {sample}</>}>
            <thead>
              <tr>
                <th scope="col">Date (UTC)</th>
                {NARRATIVES.map((n) => (
                  <th key={n} scope="col">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  {d.bps ? (
                    NARRATIVES.map((n) => <td key={n}>{d.bps?.[n]}</td>)
                  ) : (
                    <td colSpan={NARRATIVES.length}>▲ stale, not published</td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </details>

      <h3 className={ui.h3} style={{ marginTop: 48 }}>
        Highest-weighted posts
      </h3>
      <p style={{ fontSize: 13 }}>
        Post text is not shown. Only post IDs, labels, bot scores and the
        labelling model hash are listed. Labelling is not third-party
        reproducible.
      </p>
      {posts.map((g) => (
        <div key={g.narrative} style={{ marginTop: 16 }}>
          <DataTable
            caption={
              <>
                {g.narrative} · highest-weighted posts {sample}
              </>
            }
          >
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Post ID</th>
                <th scope="col">Label</th>
                <th scope="col">Bot score</th>
                <th scope="col">Model hash</th>
                <th scope="col">Weight share</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.postId}>
                  <td>{r.platform}</td>
                  <td>{r.postId}</td>
                  <td>{r.label}</td>
                  <td>{r.botScore}</td>
                  <td>{r.modelHash}</td>
                  <td>{formatBpsPercent(r.weightShareBps)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ))}

      <div className={ui.card} style={{ marginTop: 32 }}>
        <p className="label">Method</p>
        <ul className={ui.list}>
          <li>Bot and reply-spam filter before scoring.</li>
          <li>Time decay with a 48-hour half-life.</li>
          <li>
            Each post gets one label, the highest-scoring narrative. Posts below
            the entry threshold go to OTHER.
          </li>
          <li>Shares are rounded to sum to exactly 10,000 bps.</li>
          <li>
            A day with zero raw weight is not published and is marked STALE.
          </li>
        </ul>
      </div>
    </div>
  );
}
