"use client";

import { useEffect, useState, useTransition } from "react";
import type { QuoteData } from "@/lib/yahoo";
import TradingViewChart from "@/components/TradingViewChart";
import TradeTicket from "@/components/TradeTicket";
import NewsList from "@/components/NewsList";
import StatTile from "@/components/StatTile";
import { money, pct, compact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Star, Clock } from "lucide-react";
import { dataDelayMinutes, isFuturesSymbol } from "@/lib/instruments";
import { usePortfolio } from "@/components/PortfolioProvider";
import { toggleWatchlist } from "@/lib/actions";

export default function TickerClient({ ticker, initialQuote }: { ticker: string; initialQuote: QuoteData }) {
  const [quote, setQuote] = useState<QuoteData>(initialQuote);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const snapshot = usePortfolio();
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let lastPrice = initialQuote.price;
    const tick = async () => {
      try {
        const r = await fetch(`/api/quote/${ticker}`, { cache: "no-store" });
        if (!r.ok) return;
        const q: QuoteData = await r.json();
        if (cancelled) return;
        if (q.price > lastPrice) setFlash("up");
        else if (q.price < lastPrice) setFlash("down");
        lastPrice = q.price;
        setQuote(q);
        setTimeout(() => !cancelled && setFlash(null), 600);
      } catch {}
    };
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticker, initialQuote.price]);

  const isUp = quote.change >= 0;
  const watched = snapshot?.watchlist.includes(ticker) ?? false;
  const position = snapshot?.positions.find((p) => p.ticker === ticker);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl tracking-tight">{quote.symbol}</h1>
            <span className="text-[var(--color-text-dim)] text-sm">{quote.longName}</span>
            <button
              onClick={() => startTransition(() => toggleWatchlist(ticker))}
              className="text-[var(--color-text-faint)] hover:text-yellow-300"
              title={watched ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Star className={cn("w-4 h-4", watched && "fill-yellow-300 text-yellow-300")} />
            </button>
          </div>
          <div className="flex items-baseline gap-4">
            <div className={cn("font-serif text-6xl tnum tracking-tight leading-none", flash === "up" && "flash-up", flash === "down" && "flash-down")}>
              {money(quote.price)}
            </div>
            <div
              className={cn(
                "font-mono tnum text-base",
                isUp ? "text-[var(--color-up)]" : "text-[var(--color-down)]"
              )}
            >
              {isUp ? "+" : ""}{quote.change.toFixed(2)} ({pct(quote.changePct)})
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {quote.exchange} · {quote.currency} · {quote.marketState}
          </div>
          {(() => {
            const delay = dataDelayMinutes(ticker);
            const futures = isFuturesSymbol(ticker);
            if (delay.quote === 0) return null;
            return (
              <div
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded mt-1"
                style={{
                  background: futures ? "rgba(245, 158, 11, 0.10)" : "rgba(168, 171, 182, 0.08)",
                  border: futures
                    ? "1px solid rgba(245, 158, 11, 0.30)"
                    : "1px solid var(--color-border)",
                  color: futures ? "var(--color-pro)" : "var(--color-text-dim)",
                }}
                title="Free data feeds are delayed. Real-time requires paid exchange data ($30-300/mo)."
              >
                <Clock className="w-3 h-3" />
                {futures
                  ? `Chart ~${delay.chart}m delay · Quote ~${delay.quote}m delay`
                  : `Quote ~${delay.quote}m delay`}
              </div>
            );
          })()}
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <TradingViewChart ticker={ticker} height={560} />
        </div>
        <TradeTicket ticker={ticker} price={quote.price} />
      </div>

      {position && (
        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] mb-3">Your position</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <StatTile label="Shares" value={Number(position.shares)} />
            <StatTile label="Avg Cost" value={money(Number(position.avg_cost))} termKey="avgCost" />
            <StatTile label="Market value" value={money(Number(position.shares) * quote.price)} />
            <StatTile
              label="Unrealized P&L"
              termKey="unrealizedPnl"
              value={(() => {
                const pnl = Number(position.shares) * (quote.price - Number(position.avg_cost));
                return (pnl >= 0 ? "+" : "") + money(pnl);
              })()}
              valueClass={
                Number(position.shares) * (quote.price - Number(position.avg_cost)) >= 0
                  ? "text-[var(--color-up)]"
                  : "text-[var(--color-down)]"
              }
            />
            <StatTile
              label="Return"
              value={pct(((quote.price - Number(position.avg_cost)) / Number(position.avg_cost)) * 100)}
              valueClass={
                quote.price >= Number(position.avg_cost) ? "text-[var(--color-up)]" : "text-[var(--color-down)]"
              }
            />
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-serif text-3xl">Key stats</h2>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
            <StatTile label="Open" value={money(quote.open)} termKey="open" />
            <StatTile label="Prev Close" value={money(quote.prevClose)} termKey="prevClose" />
            <StatTile
              label="Day Range"
              value={`${quote.dayLow.toFixed(2)} – ${quote.dayHigh.toFixed(2)}`}
              termKey="dayRange"
            />
            <StatTile
              label="52W Range"
              value={
                quote.yearLow && quote.yearHigh
                  ? `${quote.yearLow.toFixed(2)} – ${quote.yearHigh.toFixed(2)}`
                  : "—"
              }
              termKey="yearRange"
            />
            <StatTile
              label="Market Cap"
              value={quote.marketCap ? `$${compact(quote.marketCap)}` : "—"}
              termKey="marketCap"
            />
            <StatTile label="P/E" value={quote.pe ? quote.pe.toFixed(2) : "—"} termKey="pe" />
            <StatTile label="EPS" value={quote.eps ? quote.eps.toFixed(2) : "—"} termKey="eps" />
            <StatTile
              label="Dividend Yield"
              value={quote.dividendYield ? `${quote.dividendYield.toFixed(2)}%` : "—"}
              termKey="dividendYield"
            />
            <StatTile label="Beta" value={quote.beta ? quote.beta.toFixed(2) : "—"} termKey="beta" />
            <StatTile
              label="Volume"
              value={quote.volume ? compact(quote.volume) : "—"}
              termKey="volume"
            />
            <StatTile
              label="Avg Volume"
              value={quote.avgVolume ? compact(quote.avgVolume) : "—"}
              termKey="avgVolume"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-3xl">News on {ticker}</h2>
        <NewsList symbol={ticker} limit={10} />
      </section>
    </div>
  );
}
