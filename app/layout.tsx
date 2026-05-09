import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import MobileNav from "@/components/MobileNav";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import BracketWatcher from "@/components/BracketWatcher";
import OrderWatcher from "@/components/OrderWatcher";
import AILiveWatcher from "@/components/AILiveWatcher";
import { loadPortfolio } from "@/lib/portfolio-data";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});
const jet = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jet" });

export const metadata: Metadata = {
  title: "Paper Trader — Pass your funded eval",
  description:
    "Practice on real markets with real eval rules. Unlock $50K → $100K → $150K accounts as you prove yourself.",
  manifest: "/manifest.json",
  themeColor: "#0b0c10",
  appleWebApp: {
    capable: true,
    title: "Paper Trader",
    statusBarStyle: "black-translucent",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const snapshot = await loadPortfolio();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable} ${jet.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PortfolioProvider snapshot={snapshot}>
          <Nav />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <MobileNav />
          <BracketWatcher />
          <OrderWatcher />
          <AILiveWatcher />
        </PortfolioProvider>
      </body>
    </html>
  );
}
