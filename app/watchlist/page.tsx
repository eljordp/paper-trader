"use client";

import Link from "next/link";
import { usePortfolio } from "@/components/PortfolioProvider";
import { useEffect, useState, useTransition } from "react";
import type { QuoteData } from "@/lib/yahoo";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Star } from "lucide-react";
import { toggleWatchlist } from "@/lib/actions";

export default function WatchlistPage() {
  const snapshot = usePortfolio();
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [adding, setAdding] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!snapshot || snapshot.watchlist.length === 0) return;
    const symbols = snapshot.watchlist.join(",");
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/quotes?symbols=${symbols}`);
        const data = await r.json();
        if (!cancelled) setQuotes(data);
      } catch {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [snapshot]);

  if (!snapshot) return null;

  const handleToggle = (sym: string) => {
    startTransition(async () => {
      await toggleWatchlist(sym);
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-serif text-5xl">Watchlist</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const sym = adding.trim().toUpperCase();
            if (sym) {
              handleToggle(sym);
              setAdding("");
            }
          }}
          className="flex gap-2"
        >
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Add ticker"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-3 h-9 text-sm w-40 placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
          />
          <button className="px-4 h-9 text-sm rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]">
            Add
          </button>
        </form>
      </div>

      {snapshot.watchlist.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
          <div className="text-[var(--color-text-dim)] mb-1">No tickers on your watchlist</div>
          <div className="text-xs text-[var(--color-text-faint)]">Add ones you want to track without owning yet.</div>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="min-w-[680px]">
          <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_60px] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            <div>Ticker</div>
            <div>Name</div>
            <div className="text-right">Price</div>
            <div className="text-right">Change</div>
            <div className="text-right">% Change</div>
            <div></div>
          </div>
          {snapshot.watchlist.map((sym) => {
            const q = quotes[sym];
            const up = q ? q.change >= 0 : false;
            return (
              <div
                key={sym}
                className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_60px] gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)] transition-colors items-center"
              >
                <Link href={`/trade/${sym}`} className="font-mono hover:underline">
                  {sym}
                </Link>
                <Link href={`/trade/${sym}`} className="text-sm text-[var(--color-text-dim)] truncate">
                  {q ? q.longName : "—"}
                </Link>
                <Link href={`/trade/${sym}`} className="text-right tnum font-mono text-sm">
                  {q ? money(q.price) : "—"}
                </Link>
                <Link
                  href={`/trade/${sym}`}
                  className={cn(
                    "text-right tnum font-mono text-sm",
                    q ? (up ? "text-[var(--color-up)]" : "text-[var(--color-down)]") : "text-[var(--color-text-faint)]"
                  )}
                >
                  {q ? `${up ? "+" : ""}${q.change.toFixed(2)}` : "—"}
                </Link>
                <Link
                  href={`/trade/${sym}`}
                  className={cn(
                    "text-right tnum font-mono text-sm",
                    q ? (up ? "text-[var(--color-up)]" : "text-[var(--color-down)]") : "text-[var(--color-text-faint)]"
                  )}
                >
                  {q ? pct(q.changePct) : "—"}
                </Link>
                <button
                  onClick={() => handleToggle(sym)}
                  className="text-yellow-300 hover:text-[var(--color-down)] text-xs justify-self-end"
                  title="Remove from watchlist"
                >
                  <Star className="w-4 h-4 fill-yellow-300 hover:fill-none" />
                </button>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
