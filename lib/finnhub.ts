/**
 * Finnhub API integration — real-time NBBO quotes for US stocks/ETFs.
 * Free tier: 60 req/min, perfect for paper-trader's polling.
 * For symbols Finnhub doesn't cover (futures, forex, crypto), caller falls back to Yahoo.
 */

const KEY = process.env.FINNHUB_API_KEY;

export type FinnhubQuote = {
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  timestamp: number; // unix seconds
};

export function isFinnhubKeyed(): boolean {
  return !!KEY;
}

/**
 * Decide whether to route a symbol to Finnhub.
 * Finnhub free tier covers US stocks + ETFs. Skip futures (=F), forex (=X),
 * crypto (-USD), and any exchange-prefixed symbol (with `:`).
 */
export function shouldUseFinnhub(symbol: string): boolean {
  if (!KEY) return false;
  const s = symbol.toUpperCase();
  if (s.endsWith("=F") || s.endsWith("=X") || s.endsWith("-USD")) return false;
  if (s.includes(":")) return false;
  if (s.startsWith("^")) return false; // indices like ^GSPC
  return true;
}

export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  if (!KEY) return null;
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${KEY}`,
      { cache: "no-store" }
    );
    if (!r.ok) return null;
    const d = (await r.json()) as {
      c?: number;
      d?: number;
      dp?: number;
      pc?: number;
      o?: number;
      h?: number;
      l?: number;
      t?: number;
    };
    // c=0 means symbol not found / no data
    if (!d || typeof d.c !== "number" || d.c === 0) return null;
    return {
      price: d.c,
      change: d.d ?? 0,
      changePct: d.dp ?? 0,
      prevClose: d.pc ?? 0,
      open: d.o ?? 0,
      dayHigh: d.h ?? 0,
      dayLow: d.l ?? 0,
      timestamp: d.t ?? 0,
    };
  } catch {
    return null;
  }
}

/** Batch fetch multiple Finnhub quotes in parallel. */
export async function getFinnhubQuotes(
  symbols: string[]
): Promise<Record<string, FinnhubQuote>> {
  if (!KEY || symbols.length === 0) return {};
  const results = await Promise.allSettled(
    symbols.map(async (s) => [s.toUpperCase(), await getFinnhubQuote(s)] as const)
  );
  const out: Record<string, FinnhubQuote> = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1]) {
      out[r.value[0]] = r.value[1];
    }
  }
  return out;
}
