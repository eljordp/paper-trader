import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import MobileNav from "@/components/MobileNav";
import Footer from "@/components/Footer";
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

const SITE_URL = "https://paper-trader-two-eta.vercel.app";
const SITE_TITLE = "Paper Trader — Pass your funded eval";
const SITE_DESC =
  "Practice on real markets with real eval rules. Unlock $50K → $100K → $150K accounts. Built-in AI that finds your edge.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC,
  manifest: "/manifest.json",
  themeColor: "#0b0c10",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-logo.png", sizes: "any" },
    ],
    apple: [{ url: "/icon-logo.png", sizes: "180x180" }],
    shortcut: "/icon-logo.png",
  },
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
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Paper Trader",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [
      {
        url: "/og-preview.png",
        width: 1200,
        height: 630,
        alt: "Paper Trader — pass your funded eval",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ["/og-preview.png"],
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
          <Footer />
          <MobileNav />
          <BracketWatcher />
          <OrderWatcher />
          <AILiveWatcher />
        </PortfolioProvider>
      </body>
    </html>
  );
}
