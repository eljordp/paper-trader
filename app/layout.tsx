import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { PortfolioProvider } from "@/components/PortfolioProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});
const jet = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jet" });

export const metadata: Metadata = {
  title: "Paper Trader — JDLO",
  description: "Practice trading with real market data. No real money.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable} ${jet.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PortfolioProvider>
          <Nav />
          <main className="flex-1">{children}</main>
        </PortfolioProvider>
      </body>
    </html>
  );
}
