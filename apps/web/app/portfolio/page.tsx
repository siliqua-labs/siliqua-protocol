import type { Metadata } from "next";
import { PortfolioView } from "../../components/PortfolioView";
import ui from "../../components/ui.module.css";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <div className={ui.page}>
      <h1>
        Portfolio<span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <PortfolioView />
    </div>
  );
}
