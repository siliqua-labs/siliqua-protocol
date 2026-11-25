import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { AppStateProvider } from "../components/AppState";
import { CircuitBackground } from "../components/CircuitBackground";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { walletChain } from "../lib/chain";
import "./globals.css";

const head = Archivo({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-head",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: { default: "Siliqua · The coin of compute", template: "%s · Siliqua" },
  description: "Open, recomputable indexes of GPU rent and compute narratives.",
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
    <html lang="en" className={`${head.variable} ${mono.variable}`}>
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
