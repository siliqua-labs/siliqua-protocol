import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Inter_Tight,
  JetBrains_Mono,
} from "next/font/google";
import { AppStateProvider } from "../components/AppState";
import { CircuitBackground } from "../components/CircuitBackground";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { walletChain } from "../lib/chain";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const sans = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const SITE_URL = process.env.SITE_URL ?? "https://siliqua.tech";
const TITLE = "Siliqua · The coin of compute";
const DESCRIPTION =
  "Open, recomputable indexes of GPU rent and compute narratives.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Siliqua" },
  description: DESCRIPTION,
  // "./" resolves to the address of the page being rendered.
  alternates: { canonical: "./" },
  openGraph: { type: "website", siteName: "Siliqua", url: "./" },
  twitter: { card: "summary_large_image", site: "@SiliquaCompute" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${serif.variable} ${sans.variable}`}
    >
      <body>
        <AppStateProvider chain={walletChain()}>
          <CircuitBackground />
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </AppStateProvider>
      </body>
    </html>
  );
}
