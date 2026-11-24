import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartPanel } from "../../../components/ChartPanel";
import { LivePosition } from "../../../components/LivePosition";
import { LiveTicket } from "../../../components/LiveTicket";
import { MarketTicket } from "../../../components/MarketTicket";
import { PositionCards } from "../../../components/PositionCards";
import {
  DataTable,
  Notice,
  ProbabilityBar,
  SampleTag,
  yesPercent,
} from "../../../components/primitives";
import { StatusChip } from "../../../components/StatusChip";
import ui from "../../../components/ui.module.css";
import { getMarketDetail, getMarkets } from "../../../lib/api/client";
import { formatInt, formatUsd, formatUtc } from "../../../lib/format";

type Params = { id: string };

const TIMELINE = [
  ["Mon 00:00", "Opens"],
  ["Wed 00:00", "Closes"],
  ["Thu 00:00", "TWAP starts"],
  ["Fri 00:00", "TWAP ends"],
  ["Fri 03:00", "Settle callable"],
] as const;

export async function generateStaticParams(): Promise<Params[]> {
  const { markets } = await getMarkets();
  return markets.map((m) => ({ id: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = await getMarketDetail(id);
  return { title: d ? d.market.question : "Market not found" };
}

export default async function MarketPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const d = await getMarketDetail(id);
  if (!d) notFound();
  const { market: m } = d;
  const yes = BigInt(m.yesPool);
  const no = BigInt(m.noPool);
  const pct = yesPercent(yes, no);
  return (
    <div className={ui.page}>
      <Link className="label" href="/markets">
        ← Markets
      </Link>
      <p className="label" style={{ marginTop: 20 }}>
        <StatusChip status={d.isSample ? "NOT_LIVE" : m.status} />{" "}
        {d.isSample ? <SampleTag /> : null}
      </p>
      <h1 style={{ fontSize: "clamp(32px, 6vw, 68px)" }}>{m.question}</h1>
      <Notice>
        <span className="label">Resolution criteria</span>
        <ul>
          <li>Source: 24-hour TWAP of GRI-H100 from SiliquaOracle.</li>
          <li>
            Above the threshold is YES. Equal to the threshold falls to NO.
          </li>
          <li>
            Void with full refund if the oracle is stale for more than 6
            cumulative hours in the TWAP window.
          </li>
          <li>
            If the winning side is empty, the market is void. If the losing side
            is empty, winners get their stake back with no fee.
          </li>
        </ul>
      </Notice>

      <h3 className={ui.h3}>Timeline (UTC)</h3>
      <div
        className={ui.grid4}
        style={{
          gridTemplateColumns: `repeat(${d.timeline?.length ?? 5}, minmax(120px, 1fr))`,
          overflowX: "auto",
        }}
      >
        {(
          d.timeline ??
          TIMELINE.map(([when, what]) => ({ when: `${when} UTC`, what }))
        ).map(({ when, what }) => (
          <div key={what}>
            <span className="label">{d.timeline ? formatUtc(when) : when}</span>
            <br />
            {what}
          </div>
        ))}
      </div>

      <div className={ui.grid2} style={{ marginTop: 32 }}>
        <div className={ui.card}>
          <p className="label">Pool</p>
          <ProbabilityBar yes={yes} no={no} />
          <p style={{ margin: 0 }}>
            YES {pct}% ({pct}¢) · NO {100 - pct}%
            <br />
            Pool {formatInt((yes + no).toString())} USDG · Threshold{" "}
            {formatUsd(m.thresholdMicroUsd)}
          </p>
        </div>
        {d.live ? (
          <LiveTicket
            market={m.id as `0x${string}`}
            config={d.live.config}
            cap={d.live.capBase}
            yesPool={d.live.yesPoolBase}
            noPool={d.live.noPoolBase}
          />
        ) : (
          <MarketTicket
            yesPool={m.yesPool}
            noPool={m.noPool}
            capTokens={d.perAddressCapTokens}
          />
        )}
      </div>

      <h3 className={ui.h3}>TWAP window</h3>
      <ChartPanel
        points={d.windowPoints}
        endAt={d.windowEndAt}
        thresholdMicroUsd={m.thresholdMicroUsd}
        caption="GRI-H100 hourly prints, TWAP window sample"
        summary="Sample hourly prints inside a TWAP window, with the threshold."
      />

      <h3 className={ui.h3}>Your position</h3>
      {d.live ? (
        <LivePosition market={m.id as `0x${string}`} config={d.live.config} />
      ) : (
        <PositionCards />
      )}

      <h3 className={ui.h3}>Rules and fees</h3>
      <p>
        Fee: 2% of the losing pool, taken at settlement and accrued in the
        market. Anyone can sweep it to the fee router, which splits it 50%
        buyback and burn of $SILQ, 30% treasury, 20% oracle operators. The
        router only splits. The buyback is manual and executed by an announced
        multisig.
      </p>
      <p>
        The per-address cap and region restrictions are partial mitigations, not
        guarantees. Multiple wallets can bypass the cap, and region restriction
        is enforced in the frontend and API only.
      </p>
      <DataTable caption="On-chain">
        <thead>
          <tr>
            <th scope="col">Contract</th>
            <th scope="col">Address</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {(d.factory
            ? [
                ["RangeMarket", m.id],
                ["MarketFactory", d.factory],
              ]
            : [
                "RangeMarket",
                "SiliquaOracle",
                "MarketFactory",
                "FeeRouter",
              ].map((c) => [c, "not deployed"])
          ).map(([c, address]) => (
            <tr key={c}>
              <td>{c}</td>
              <td>{address}</td>
              <td>unverified</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
