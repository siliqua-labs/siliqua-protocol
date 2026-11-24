import type { Metadata } from "next";
import { MarketList } from "../../components/MarketList";
import { Notice } from "../../components/primitives";
import ui from "../../components/ui.module.css";
import { getMarkets } from "../../lib/api/client";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage() {
  const { markets, isSample } = await getMarkets();
  return (
    <div className={ui.page}>
      <h1>
        Markets<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <div style={{ marginTop: 24 }}>
        {isSample ? (
          <Notice>
            <h2 style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>
              Markets are not live<span style={{ color: "var(--em)" }}>.</span>
            </h2>
            <p style={{ margin: "12px 0 0", color: "var(--tx)" }}>
              They open only after legal review and a contract audit. Everything
              below is sample data.
            </p>
          </Notice>
        ) : null}
      </div>
      <MarketList markets={markets} isSample={isSample} />
    </div>
  );
}
