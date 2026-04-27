import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export type QuoteData = {
  symbol: string;
  shortName: string;
  longName: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  yearHigh: number | null;
  yearLow: number | null;
  marketCap: number | null;
  pe: number | null;
  eps: number | null;
  volume: number | null;
  avgVolume: number | null;
  dividendYield: number | null;
  beta: number | null;
  exchange: string;
  currency: string;
  marketState: string;
};

export async function getQuote(symbol: string): Promise<QuoteData> {
  const q = await yahooFinance.quote(symbol);
  if (!q) throw new Error(`No quote for ${symbol}`);
  return {
    symbol: q.symbol,
    shortName: q.shortName ?? q.symbol,
    longName: q.longName ?? q.shortName ?? q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
    prevClose: q.regularMarketPreviousClose ?? 0,
    open: q.regularMarketOpen ?? 0,
    dayHigh: q.regularMarketDayHigh ?? 0,
    dayLow: q.regularMarketDayLow ?? 0,
    yearHigh: q.fiftyTwoWeekHigh ?? null,
    yearLow: q.fiftyTwoWeekLow ?? null,
    marketCap: q.marketCap ?? null,
    pe: q.trailingPE ?? null,
    eps: q.epsTrailingTwelveMonths ?? null,
    volume: q.regularMarketVolume ?? null,
    avgVolume: q.averageDailyVolume3Month ?? null,
    dividendYield: q.trailingAnnualDividendYield ? q.trailingAnnualDividendYield * 100 : null,
    beta: (q as { beta?: number }).beta ?? null,
    exchange: q.fullExchangeName ?? q.exchange ?? "",
    currency: q.currency ?? "USD",
    marketState: q.marketState ?? "REGULAR",
  };
}

export async function getQuotes(symbols: string[]): Promise<Record<string, QuoteData>> {
  if (symbols.length === 0) return {};
  const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  const out: Record<string, QuoteData> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out[symbols[i].toUpperCase()] = r.value;
  });
  return out;
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

export type Range = "1D" | "5D" | "1M" | "3M" | "1Y" | "5Y";

function rangeParams(range: Range): { period1: Date; interval: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" } {
  const now = new Date();
  switch (range) {
    case "1D": {
      const d = new Date(now);
      d.setHours(d.getHours() - 24);
      return { period1: d, interval: "5m" };
    }
    case "5D": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { period1: d, interval: "15m" };
    }
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { period1: d, interval: "1h" };
    }
    case "3M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return { period1: d, interval: "1d" };
    }
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { period1: d, interval: "1d" };
    }
    case "5Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 5);
      return { period1: d, interval: "1wk" };
    }
  }
}

export async function getCandles(symbol: string, range: Range): Promise<Candle[]> {
  const { period1, interval } = rangeParams(range);
  const result = await yahooFinance.chart(symbol, { period1, interval });
  if (!result?.quotes) return [];
  return result.quotes
    .filter((q) => q.close != null && q.date != null)
    .map((q) => ({
      time: Math.floor(new Date(q.date as Date).getTime() / 1000),
      open: q.open ?? q.close ?? 0,
      high: q.high ?? q.close ?? 0,
      low: q.low ?? q.close ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    }));
}

export type SearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

export async function searchTickers(query: string): Promise<SearchResult[]> {
  if (!query || query.length < 1) return [];
  const r = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 });
  return (r.quotes ?? [])
    .filter((q) => "symbol" in q && q.symbol)
    .map((q) => {
      const item = q as {
        symbol: string;
        shortname?: string;
        longname?: string;
        exchDisp?: string;
        typeDisp?: string;
      };
      return {
        symbol: item.symbol,
        name: item.longname ?? item.shortname ?? item.symbol,
        exchange: item.exchDisp ?? "",
        type: item.typeDisp ?? "",
      };
    });
}

export type NewsItem = {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  thumbnail: string | null;
  relatedTickers: string[];
};

export async function getNews(symbol?: string): Promise<NewsItem[]> {
  const query = symbol ?? "SPY";
  const r = await yahooFinance.search(query, { quotesCount: 0, newsCount: 20 });
  return (r.news ?? []).map((n) => ({
    uuid: n.uuid,
    title: n.title,
    publisher: n.publisher,
    link: n.link,
    publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : new Date().toISOString(),
    thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
    relatedTickers: n.relatedTickers ?? [],
  }));
}

export async function getMarketMovers(): Promise<{ gainers: QuoteData[]; losers: QuoteData[]; mostActive: QuoteData[] }> {
  const [gainers, losers, mostActive] = await Promise.all([
    yahooFinance.screener({ scrIds: "day_gainers", count: 10 }).catch(() => ({ quotes: [] })),
    yahooFinance.screener({ scrIds: "day_losers", count: 10 }).catch(() => ({ quotes: [] })),
    yahooFinance.screener({ scrIds: "most_actives", count: 10 }).catch(() => ({ quotes: [] })),
  ]);

  const norm = (q: { symbol: string; shortName?: string; longName?: string; regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number; regularMarketPreviousClose?: number }): QuoteData => ({
    symbol: q.symbol,
    shortName: q.shortName ?? q.symbol,
    longName: q.longName ?? q.shortName ?? q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
    prevClose: q.regularMarketPreviousClose ?? 0,
    open: 0, dayHigh: 0, dayLow: 0,
    yearHigh: null, yearLow: null, marketCap: null,
    pe: null, eps: null, volume: null, avgVolume: null,
    dividendYield: null, beta: null,
    exchange: "", currency: "USD", marketState: "REGULAR",
  });

  return {
    gainers: ((gainers as { quotes?: unknown[] }).quotes ?? []).map((q) => norm(q as Parameters<typeof norm>[0])),
    losers: ((losers as { quotes?: unknown[] }).quotes ?? []).map((q) => norm(q as Parameters<typeof norm>[0])),
    mostActive: ((mostActive as { quotes?: unknown[] }).quotes ?? []).map((q) => norm(q as Parameters<typeof norm>[0])),
  };
}
