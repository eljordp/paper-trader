"use client";

export type Position = {
  ticker: string;
  shares: number;
  avgCost: number;
  openedAt: string;
};

export type Trade = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  timestamp: string;
  realizedPnl?: number;
};

export type Portfolio = {
  cash: number;
  startingCash: number;
  positions: Position[];
  trades: Trade[];
  watchlist: string[];
  createdAt: string;
};

const KEY = "paper-trader.portfolio.v1";
const DEFAULT_START_CASH = 100_000;

export function emptyPortfolio(startingCash = DEFAULT_START_CASH): Portfolio {
  return {
    cash: startingCash,
    startingCash,
    positions: [],
    trades: [],
    watchlist: ["AAPL", "TSLA", "NVDA", "MSFT", "SPY"],
    createdAt: new Date().toISOString(),
  };
}

export function loadPortfolio(): Portfolio {
  if (typeof window === "undefined") return emptyPortfolio();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const p = emptyPortfolio();
      window.localStorage.setItem(KEY, JSON.stringify(p));
      return p;
    }
    return JSON.parse(raw) as Portfolio;
  } catch {
    return emptyPortfolio();
  }
}

export function savePortfolio(p: Portfolio) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function resetPortfolio(startingCash = DEFAULT_START_CASH): Portfolio {
  const p = emptyPortfolio(startingCash);
  savePortfolio(p);
  return p;
}

/** Execute a buy. Throws if not enough cash. */
export function executeBuy(p: Portfolio, ticker: string, qty: number, price: number): Portfolio {
  ticker = ticker.toUpperCase();
  if (qty <= 0) throw new Error("Quantity must be greater than 0");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid price");
  const total = qty * price;
  if (total > p.cash + 1e-6) throw new Error("Not enough cash");

  const positions = [...p.positions];
  const idx = positions.findIndex((x) => x.ticker === ticker);
  if (idx >= 0) {
    const ex = positions[idx];
    const newShares = ex.shares + qty;
    const newCost = (ex.shares * ex.avgCost + qty * price) / newShares;
    positions[idx] = { ...ex, shares: newShares, avgCost: newCost };
  } else {
    positions.push({
      ticker,
      shares: qty,
      avgCost: price,
      openedAt: new Date().toISOString(),
    });
  }

  const trade: Trade = {
    id: crypto.randomUUID(),
    ticker,
    side: "buy",
    shares: qty,
    price,
    total,
    timestamp: new Date().toISOString(),
  };

  return {
    ...p,
    cash: p.cash - total,
    positions,
    trades: [trade, ...p.trades],
  };
}

/** Execute a sell. Throws if not enough shares. */
export function executeSell(p: Portfolio, ticker: string, qty: number, price: number): Portfolio {
  ticker = ticker.toUpperCase();
  if (qty <= 0) throw new Error("Quantity must be greater than 0");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid price");

  const positions = [...p.positions];
  const idx = positions.findIndex((x) => x.ticker === ticker);
  if (idx < 0) throw new Error(`No position in ${ticker}`);
  const pos = positions[idx];
  if (qty > pos.shares + 1e-6) throw new Error(`Only have ${pos.shares} shares`);

  const proceeds = qty * price;
  const realizedPnl = qty * (price - pos.avgCost);

  const remainShares = pos.shares - qty;
  if (remainShares < 1e-6) {
    positions.splice(idx, 1);
  } else {
    positions[idx] = { ...pos, shares: remainShares };
  }

  const trade: Trade = {
    id: crypto.randomUUID(),
    ticker,
    side: "sell",
    shares: qty,
    price,
    total: proceeds,
    timestamp: new Date().toISOString(),
    realizedPnl,
  };

  return {
    ...p,
    cash: p.cash + proceeds,
    positions,
    trades: [trade, ...p.trades],
  };
}

export function toggleWatch(p: Portfolio, ticker: string): Portfolio {
  ticker = ticker.toUpperCase();
  const has = p.watchlist.includes(ticker);
  return {
    ...p,
    watchlist: has ? p.watchlist.filter((t) => t !== ticker) : [...p.watchlist, ticker],
  };
}

export function totalRealizedPnl(p: Portfolio): number {
  return p.trades.reduce((acc, t) => acc + (t.realizedPnl ?? 0), 0);
}

export function unrealizedPnl(p: Portfolio, prices: Record<string, number>): number {
  return p.positions.reduce((acc, pos) => {
    const px = prices[pos.ticker];
    if (!Number.isFinite(px)) return acc;
    return acc + pos.shares * (px - pos.avgCost);
  }, 0);
}

export function positionsValue(p: Portfolio, prices: Record<string, number>): number {
  return p.positions.reduce((acc, pos) => {
    const px = prices[pos.ticker];
    if (!Number.isFinite(px)) return acc + pos.shares * pos.avgCost;
    return acc + pos.shares * px;
  }, 0);
}

export function totalEquity(p: Portfolio, prices: Record<string, number>): number {
  return p.cash + positionsValue(p, prices);
}
