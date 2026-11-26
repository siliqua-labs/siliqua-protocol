import type { Metadata } from "next";
import Link from "next/link";
import { NarrativeBar, Sparkline } from "../components/charts";
import { HeroHud } from "../components/HeroHud";
import { MarketCard } from "../components/MarketCard";
import { ButtonLink, DataTable, SampleTag } from "../components/primitives";
import { Reveal } from "../components/Reveal";
import { StatusChip } from "../components/StatusChip";
import { Tape } from "../components/Tape";
import { CoinFallback } from "../components/three/CoinFallback";
import { ThreeScene } from "../components/three/ThreeScene";
import ui from "../components/ui.module.css";
import {
  getIndexes,
  getMarkets,
  getNarratives,
  getOracle,
} from "../lib/api/client";
import { at } from "../lib/at";
import { changeTone, formatChange, formatUsd, formatUtc } from "../lib/format";
import styles from "./page.module.css";

// The layout's "./" resolves to "/index" when this page is regenerated.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Siliqua", url: "/" },
};

const LAYERS = [
  ["SOURCES", "At least 5 providers per GPU class"],
  ["OPERATORS", "At least 2 of 3 values agree within the tolerance"],
  ["ORACLE", "Median stored on-chain"],
  ["MARKETS", "Settles on a 24-hour TWAP"],
] as const;

const STEPS = [
  ["Collect", "Provider listing prices, sampled every 10 minutes."],
  ["Filter", "Drop outliers. Require 5 valid sources."],
  ["Sign", "Each operator signs its own value. The contract keeps the median."],
  ["Settle", "Markets read the 24-hour TWAP."],
] as const;

const HOME_MARKETS = 4;

const ROADMAP = [
  ["data", "Data", "Gate: 30 days of data, no gap over 6 hours"],
  [
    "oracle",
    "On-chain oracle",
    "Gate: 14 days of operator spread under tolerance",
  ],
  [
    "cmi",
    "Compute Mindshare Index",
    "Gate: 500-post labeled test set documented",
  ],
  ["markets", "Markets", "Gate: legal review and contract audit"],
] as const;

function Layer({ index }: { index: number }) {
  const [name, text] = at(LAYERS, index);
  return (
    <li>
      <b>{name}</b>
      <p>{text}</p>
    </li>
  );
}

export default async function Home() {
  const [
    { indexes, methodologyVersion, isSample },
    narratives,
    { markets, isSample: marketsAreSample },
    oracle,
  ] = await Promise.all([
    getIndexes(),
    getNarratives(),
    getMarkets(),
    getOracle(),
  ]);
  const latest = [...narratives.days].reverse().find((d) => d.bps);
  // A phase is running only when its page shows real data; the gate is a separate, later step.
  const running = {
    data: !isSample,
    oracle: oracle !== null && !oracle.isSample,
    cmi: !narratives.isSample && latest !== undefined,
    markets: !marketsAreSample,
  };
  const lead = at(indexes, 0);
  // One card per open market (one per index); the pools scene sums all of them.
  const openMarkets = markets
    .filter((m) => m.status === "OPEN")
    .slice(0, HOME_MARKETS);
  const yesTotal = openMarkets.reduce((sum, m) => sum + BigInt(m.yesPool), 0n);
  const poolTotal = openMarkets.reduce(
    (sum, m) => sum + BigInt(m.yesPool) + BigInt(m.noPool),
    0n,
  );
  const yesShare =
    poolTotal > 0n ? Number((yesTotal * 100n) / poolTotal) / 100 : 0.5;
  return (
    <>
      <section className={`${ui.page} ${ui.plain} ${styles.heroSection}`}>
        <div className={styles.hero}>
          <div>
            <p className="label">
              <b className={styles.em}>■</b> GRI / CMI · ON-CHAIN COMPUTE
              INDEXES
            </p>
            <h1>
              The coin
              <br />
              of <i>compute.</i>
            </h1>
            <p style={{ marginTop: 24, fontSize: 18 }}>
              Open, recomputable indexes for GPU rental prices and compute
              narratives, published on-chain. Trade the price of a GPU hour.
            </p>
            <div className={ui.cta}>
              <a className={`${ui.btn} ${ui.primary}`} href="#indexes">
                Explore the indexes →
              </a>
              <ButtonLink href="/methodology">Read the methodology</ButtonLink>
            </div>
          </div>
          <HeroHud lead={lead} isSample={isSample}>
            <ThreeScene
              kind="coin"
              label="Layered burgundy and white hex panels, slowly rotating"
              className={styles.coin}
              fallback={<CoinFallback />}
            />
          </HeroHud>
        </div>
        <div className={ui.spec}>
          <div>
            <span className="label">{lead.indexId} · USD / GPU-hr</span>
            <b>{formatUsd(lead.valueMicroUsd)}</b>
          </div>
          <div>
            <span className="label">7-day change</span>
            <b className={changeTone(lead.change7dBps)}>
              {formatChange(lead.change7dBps)}
            </b>
          </div>
          <div>
            <span className="label">Valid sources</span>
            <b>
              {lead.validSources} / {lead.minValidSources} min
            </b>
          </div>
        </div>
        {isSample && (
          <p className="label" style={{ margin: "16px 0 0" }}>
            <SampleTag />
          </p>
        )}
      </section>

      <Tape indexes={indexes} isSample={isSample} />

      <Reveal className={`${ui.page} ${ui.tinted}`} id="architecture">
        <h2>
          One index.
          <br />
          Four layers of proof<span className={styles.em}>.</span>
        </h2>
        <div className={styles.arch}>
          <ol className={styles.layers}>
            {[0, 2].map((i) => (
              <Layer key={i} index={i} />
            ))}
          </ol>
          <ThreeScene
            kind="stack"
            label="Four coin layers that separate as you scroll: sources, operators, oracle, markets"
            className={styles.stack}
          />
          <ol className={styles.layers}>
            {[1, 3].map((i) => (
              <Layer key={i} index={i} />
            ))}
          </ol>
        </div>
        <p style={{ marginTop: 36 }}>
          One provider that lists a wild price should not move the index.
          Outliers are measured from the median and dropped first, then the rest
          are averaged with equal weight.
        </p>
      </Reveal>

      <Reveal className={`${ui.page} ${ui.tinted}`} id="indexes">
        <div className={`label ${ui.sectionHead}`}>LIVE INDEXES</div>
        <h2>
          The price of a GPU hour<span className={styles.em}>.</span>
        </h2>
        <p className="label">
          Methodology v{methodologyVersion} {isSample && <SampleTag />}
        </p>
        <DataTable caption="GPU Rent Index, all classes">
          <thead>
            <tr>
              <th scope="col">Index</th>
              <th scope="col">Value (USD/hr)</th>
              <th scope="col">24h</th>
              <th scope="col">7d</th>
              <th scope="col">Trend</th>
              <th scope="col">Valid sources</th>
              <th scope="col">Updated</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {indexes.map((i) => (
              <tr key={i.indexId}>
                <td>
                  <Link href={`/gpu/${i.slug}`}>{i.indexId}</Link>
                </td>
                <td>
                  {formatUsd(i.valueMicroUsd)}
                  {i.status === "INSUFFICIENT_SOURCES" && i.valueMicroUsd
                    ? " (last)"
                    : ""}
                </td>
                <td className={changeTone(i.change24hBps)}>
                  {formatChange(i.change24hBps)}
                </td>
                <td className={changeTone(i.change7dBps)}>
                  {formatChange(i.change7dBps)}
                </td>
                <td>
                  <Sparkline values={i.trend7d} />
                </td>
                <td>
                  {i.validSources} / {i.minValidSources}
                </td>
                <td>{formatUtc(i.updatedAt)}</td>
                <td>
                  <StatusChip status={i.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className={ui.legend}>
          <span>● LIVE: fresh print</span>
          <span>▲ STALE: last value kept</span>
          <span>■ INSUFFICIENT SOURCES: not published</span>
        </div>
      </Reveal>

      {latest?.bps && (
        <Reveal className={`${ui.page} ${ui.tinted}`}>
          <h2>
            Where compute attention goes<span className={styles.em}>.</span>
          </h2>
          <p className="label">
            CMI · {latest.date} UTC · TOTAL 10,000 BPS{" "}
            {narratives.isSample && <SampleTag />}
          </p>
          <NarrativeBar bps={latest.bps} />
          <p style={{ marginTop: 20 }}>
            Shares of social attention, weighted by account credibility and
            decayed over a 48-hour half-life.
          </p>
          <ButtonLink href="/narratives">Open narratives</ButtonLink>
        </Reveal>
      )}

      {openMarkets.length > 0 && (
        <Reveal className={`${ui.page} ${ui.tinted}`} id="weekly-markets">
          <h2>
            One question a week, per index<span className={styles.em}>.</span>
          </h2>
          <div
            className={ui.grid2}
            style={{ marginTop: 28, alignItems: "start" }}
          >
            <div style={{ display: "grid", gap: 20 }}>
              {openMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={
                    marketsAreSample
                      ? { ...market, status: "NOT_LIVE" }
                      : market
                  }
                  isSample={marketsAreSample}
                  detailed
                />
              ))}
            </div>
            {/* Stays in view while the market list scrolls past. */}
            <div style={{ position: "sticky", top: 96 }}>
              <p>
                Pools are parimutuel: YES and NO stakes in USDG. The losing pool
                pays the winners, minus a 2% fee taken only at settlement.
              </p>
              <ButtonLink href="/markets">See markets</ButtonLink>
              <ThreeScene
                kind="pools"
                yesShare={yesShare}
                label="Two coin stacks sized to the YES and NO pools"
                className={styles.pools}
              />
            </div>
          </div>
        </Reveal>
      )}

      <Reveal className={`${ui.page} ${ui.dark}`}>
        <div className={`label ${ui.sectionHead}`}>METHODOLOGY</div>
        <h2>
          Built to be recomputed<span className={styles.em}>.</span>
        </h2>
        <div className={ui.grid4} data-cells style={{ marginTop: 28 }}>
          {STEPS.map(([title, text]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p style={{ fontSize: 13 }}>{text}</p>
            </div>
          ))}
        </div>
        <div className={ui.card} style={{ marginTop: 24 }}>
          <p className="label">
            v{methodologyVersion} DRAFT · WHAT V1 IS, AND IS NOT
          </p>
          <ul className={ui.list}>
            <li>
              Operated by the Siliqua team. Operators are not independent yet.
            </li>
            <li>No stake or slashing in v1.</li>
            <li>Methodology and source list are published.</li>
            <li>Changes are announced 14 days before they take effect.</li>
          </ul>
        </div>
      </Reveal>

      <Reveal className={`${ui.page} ${ui.tinted}`}>
        <h2>
          Four phases<span className={styles.em}>.</span>
        </h2>
        <div className={ui.grid4} data-cells style={{ marginTop: 28 }}>
          {ROADMAP.map(([phase, title, gate]) => (
            <div key={title}>
              <h3 style={{ fontSize: 17 }}>{title}</h3>
              <p style={{ margin: "12px 0" }}>
                <StatusChip status={running[phase] ? "RUNNING" : "NOT_LIVE"} />
              </p>
              <p style={{ fontSize: 13 }}>{gate}</p>
            </div>
          ))}
        </div>
      </Reveal>
      <div className={ui.band}>
        <h3>The next print lands at the top of the hour.</h3>
        <ButtonLink href="/methodology" primary>
          Read the methodology
        </ButtonLink>
      </div>
    </>
  );
}
