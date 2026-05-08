export type InstrumentType = "stock" | "futures";

export type FuturesSpec = {
  symbol: string; // Yahoo symbol with =F suffix
  displaySymbol: string; // What we show users
  name: string;
  underlying: string;
  category: "index" | "metal" | "energy" | "currency" | "rate";
  pointValue: number; // $ per 1.0 point of price move
  tickSize: number; // smallest price increment
  tickValue: number; // = tickSize * pointValue
  dayTradeMargin: number; // $ required per contract intraday (sim approx — Topstep/Apex use ~$50 micro)
  isMicro: boolean;
};

// Catalog of supported futures (micro-focused — what Topstep / Apex / MFFU candidates use)
export const FUTURES_CATALOG: Record<string, FuturesSpec> = {
  "MES=F": {
    symbol: "MES=F",
    displaySymbol: "MES",
    name: "Micro E-mini S&P 500",
    underlying: "S&P 500",
    category: "index",
    pointValue: 5,
    tickSize: 0.25,
    tickValue: 1.25,
    dayTradeMargin: 50,
    isMicro: true,
  },
  "MNQ=F": {
    symbol: "MNQ=F",
    displaySymbol: "MNQ",
    name: "Micro E-mini Nasdaq-100",
    underlying: "Nasdaq-100",
    category: "index",
    pointValue: 2,
    tickSize: 0.25,
    tickValue: 0.5,
    dayTradeMargin: 50,
    isMicro: true,
  },
  "MYM=F": {
    symbol: "MYM=F",
    displaySymbol: "MYM",
    name: "Micro E-mini Dow",
    underlying: "Dow Jones",
    category: "index",
    pointValue: 0.5,
    tickSize: 1,
    tickValue: 0.5,
    dayTradeMargin: 50,
    isMicro: true,
  },
  "M2K=F": {
    symbol: "M2K=F",
    displaySymbol: "M2K",
    name: "Micro E-mini Russell 2000",
    underlying: "Russell 2000",
    category: "index",
    pointValue: 5,
    tickSize: 0.1,
    tickValue: 0.5,
    dayTradeMargin: 50,
    isMicro: true,
  },
  "MGC=F": {
    symbol: "MGC=F",
    displaySymbol: "MGC",
    name: "Micro Gold",
    underlying: "Gold",
    category: "metal",
    pointValue: 10,
    tickSize: 0.1,
    tickValue: 1,
    dayTradeMargin: 50,
    isMicro: true,
  },
  "MCL=F": {
    symbol: "MCL=F",
    displaySymbol: "MCL",
    name: "Micro Crude Oil",
    underlying: "WTI Crude",
    category: "energy",
    pointValue: 100,
    tickSize: 0.01,
    tickValue: 1,
    dayTradeMargin: 50,
    isMicro: true,
  },
  // Full-size for reference (higher margin)
  "ES=F": {
    symbol: "ES=F",
    displaySymbol: "ES",
    name: "E-mini S&P 500",
    underlying: "S&P 500",
    category: "index",
    pointValue: 50,
    tickSize: 0.25,
    tickValue: 12.5,
    dayTradeMargin: 500,
    isMicro: false,
  },
  "NQ=F": {
    symbol: "NQ=F",
    displaySymbol: "NQ",
    name: "E-mini Nasdaq-100",
    underlying: "Nasdaq-100",
    category: "index",
    pointValue: 20,
    tickSize: 0.25,
    tickValue: 5,
    dayTradeMargin: 500,
    isMicro: false,
  },
  "GC=F": {
    symbol: "GC=F",
    displaySymbol: "GC",
    name: "Gold",
    underlying: "Gold",
    category: "metal",
    pointValue: 100,
    tickSize: 0.1,
    tickValue: 10,
    dayTradeMargin: 500,
    isMicro: false,
  },
  "CL=F": {
    symbol: "CL=F",
    displaySymbol: "CL",
    name: "Crude Oil",
    underlying: "WTI Crude",
    category: "energy",
    pointValue: 1000,
    tickSize: 0.01,
    tickValue: 10,
    dayTradeMargin: 500,
    isMicro: false,
  },
};

/** Normalize any user-typed symbol into Yahoo form. e.g. 'MES' -> 'MES=F'. */
export function normalizeSymbol(input: string): string {
  const s = input.trim().toUpperCase();
  if (!s) return s;
  if (s.endsWith("=F")) return s;
  // Common shorthand like 'MES', 'NQ' — try suffix
  if (FUTURES_CATALOG[s + "=F"]) return s + "=F";
  return s;
}

export function isFuturesSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const s = symbol.toUpperCase();
  return s in FUTURES_CATALOG || s.endsWith("=F");
}

export function getFuturesSpec(symbol: string): FuturesSpec | null {
  const s = normalizeSymbol(symbol);
  return FUTURES_CATALOG[s] ?? null;
}

export function instrumentType(symbol: string): InstrumentType {
  return isFuturesSymbol(symbol) ? "futures" : "stock";
}

/** Pretty-print a futures display symbol from any input form. Returns input for non-futures. */
export function displaySymbol(symbol: string): string {
  const spec = getFuturesSpec(symbol);
  if (spec) return spec.displaySymbol;
  return symbol;
}

/**
 * Approximate data delay for a symbol on our free data feeds.
 * Yahoo quote: ~15min delayed for everything free
 * TradingView embed: real-time-ish for major US stocks, 10-15min delayed for futures
 */
export function dataDelayMinutes(symbol: string): { chart: number; quote: number } {
  if (isFuturesSymbol(symbol)) {
    return { chart: 10, quote: 15 };
  }
  if (symbol.endsWith("=X")) {
    // Forex
    return { chart: 0, quote: 5 };
  }
  if (symbol.endsWith("-USD")) {
    // Crypto
    return { chart: 0, quote: 1 };
  }
  // Stocks
  return { chart: 0, quote: 15 };
}

/** Compute realized P&L given entry, exit, and quantity for a position. */
export function computeRealizedPnl(opts: {
  side: "long" | "short";
  instrumentType: InstrumentType;
  entry: number;
  exit: number;
  qty: number;
  pointValue?: number;
}): number {
  const { side, instrumentType, entry, exit, qty } = opts;
  if (instrumentType === "futures") {
    const pv = opts.pointValue ?? 1;
    const move = side === "long" ? exit - entry : entry - exit;
    return move * pv * qty;
  }
  // Stocks: shares × price diff
  const move = side === "long" ? exit - entry : entry - exit;
  return move * qty;
}

/** Compute unrealized P&L for an open position. */
export function computeUnrealizedPnl(opts: {
  side: "long" | "short";
  instrumentType: InstrumentType;
  entry: number;
  current: number;
  qty: number;
  pointValue?: number;
}): number {
  return computeRealizedPnl({
    side: opts.side,
    instrumentType: opts.instrumentType,
    entry: opts.entry,
    exit: opts.current,
    qty: opts.qty,
    pointValue: opts.pointValue,
  });
}
