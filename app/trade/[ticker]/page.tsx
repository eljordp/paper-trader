import { notFound } from "next/navigation";
import { getQuote } from "@/lib/yahoo";
import TickerClient from "./ticker-client";

export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  try {
    const initialQuote = await getQuote(sym);
    return <TickerClient ticker={sym} initialQuote={initialQuote} />;
  } catch {
    notFound();
  }
}
