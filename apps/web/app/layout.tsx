import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { AppStateProvider } from "../components/AppState";
import { CircuitBackground } from "../components/CircuitBackground";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
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
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%236D001A'/%3E%3Crect x='5' y='5' width='6' height='6' fill='%23ffffff'/%3E%3C/svg%3E",
  },
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
        <AppStateProvider>
          <CircuitBackground />
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </AppStateProvider>
      </body>
    </html>
  );
}
