import { notFound } from "next/navigation";
import { getQuote } from "@/lib/yahoo";
import TickerClient from "./ticker-client";

export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  // Defensive: decode URL-encoded chars (e.g. %3D from =F futures suffix)
  let decoded = ticker;
  try {
    decoded = decodeURIComponent(ticker);
  } catch {
    /* keep raw */
  }
  const sym = decoded.toUpperCase();
  try {
    const initialQuote = await getQuote(sym);
    return <TickerClient ticker={sym} initialQuote={initialQuote} />;
  } catch {
    notFound();
  }
}
