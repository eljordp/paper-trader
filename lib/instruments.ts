export type InstrumentType = "stock" | "futures" | "option";

// Yahoo OCC-style option contract symbol parser. Format:
//   {UNDERLYING}{YY}{MM}{DD}{C|P}{STRIKE*1000 padded to 8 digits}
// e.g. "SPY250620C00450000" = SPY $450 call expiring 2025-06-20
const OPTION_SYMBOL_RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;

export type ParsedOption = {
  underlying: string;
  expiration: Date;     // UTC midnight on the expiration date
  optionType: "call" | "put";
  strike: number;
  contractSymbol: string;
};

export function parseOptionSymbol(symbol: string): ParsedOption | null {
  const m = symbol.match(OPTION_SYMBOL_RE);
  if (!m) return null;
  const [, underlying, dateStr, cp, strikeStr] = m;
  const year = 2000 + parseInt(dateStr.slice(0, 2), 10);
  const month = parseInt(dateStr.slice(2, 4), 10) - 1;
  const day = parseInt(dateStr.slice(4, 6), 10);
  const expiration = new Date(Date.UTC(year, month, day));
  const strike = parseInt(strikeStr, 10) / 1000;
  return {
    underlying,
    expiration,
    optionType: cp === "C" ? "call" : "put",
    strike,
    contractSymbol: symbol,
  };
}

export function isOptionSymbol(symbol: string): boolean {
  return OPTION_SYMBOL_RE.test(symbol);
}

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
  if (isOptionSymbol(symbol)) return "option";
  if (isFuturesSymbol(symbol)) return "futures";
  return "stock";
}

// Options multiplier is 100 — one contract controls 100 shares of underlying.
// We expose it as a constant rather than hard-coding for clarity.
export const OPTION_CONTRACT_MULTIPLIER = 100;

// Pick the ATM (closest-to-money) strike from a list. Returns null if empty.
export function pickAtmStrike(
  strikes: number[],
  underlyingPrice: number,
): number | null {
  if (strikes.length === 0) return null;
  let best = strikes[0];
  let bestDist = Math.abs(best - underlyingPrice);
  for (const s of strikes) {
    const d = Math.abs(s - underlyingPrice);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

// Pick an expiration date from a list of available expirations. Default
// picks the FIRST expiration that is >= minDaysOut (typically the next
// weekly Friday). If none qualify, returns the soonest.
export function pickExpiration(
  expirations: Date[],
  minDaysOut: number = 3,
): Date | null {
  if (expirations.length === 0) return null;
  const cutoff = Date.now() + minDaysOut * 24 * 60 * 60_000;
  const future = expirations
    .map((d) => new Date(d))
    .filter((d) => d.getTime() >= cutoff)
    .sort((a, b) => a.getTime() - b.getTime());
  if (future.length > 0) return future[0];
  // No expiration far enough out — return the latest available
  const sorted = [...expirations].sort((a, b) => b.getTime() - a.getTime());
  return sorted[0] ?? null;
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
