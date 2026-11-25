import type { Metadata } from "next";
import { LivePortfolio } from "../../components/LivePortfolio";
import { PortfolioView } from "../../components/PortfolioView";
import ui from "../../components/ui.module.css";
import { getPortfolioData } from "../../lib/api/client";

export const metadata: Metadata = { title: "Portfolio" };
export const revalidate = 60;

export default async function PortfolioPage() {
  const data = await getPortfolioData();
  return (
    <div className={ui.page}>
      <h1>
        Portfolio<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      {data.isSample ? (
        <PortfolioView />
      ) : (
        <LivePortfolio markets={data.markets} config={data.config} />
      )}
    </div>
  );
}
