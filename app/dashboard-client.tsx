"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortfolio } from "@/components/PortfolioProvider";
import PositionsTable from "@/components/PositionsTable";
import NewsList from "@/components/NewsList";
import { money, pct } from "@/lib/format";
import { totalEquity, totalRealizedPnl, unrealizedPnl, positionsValue } from "@/lib/store";
import { cn } from "@/lib/cn";
import { TermLabel } from "@/components/Tooltip";
import { ArrowRight } from "lucide-react";

export default function DashboardClient() {
  const { portfolio, ready, reset } = usePortfolio();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [movers, setMovers] = useState<{
    gainers: Array<{ symbol: string; price: number; changePct: number; shortName: string }>;
    losers: Array<{ symbol: string; price: number; changePct: number; shortName: string }>;
    mostActive: Array<{ symbol: string; price: number; changePct: number; shortName: string }>;
  } | null>(null);

  useEffect(() => {
    if (!portfolio) return;
    const symbols = [...portfolio.positions.map((p) => p.ticker), ...portfolio.watchlist].join(",");
    if (!symbols) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/quotes?symbols=${symbols}`);
        const data = await r.json();
        if (cancelled) return;
        const px: Record<string, number> = {};
        for (const sym of Object.keys(data)) px[sym] = data[sym].price;
        setPrices(px);
      } catch {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [portfolio]);

  useEffect(() => {
    fetch("/api/movers")
      .then((r) => r.json())
      .then((d) => setMovers(d))
      .catch(() => {});
  }, []);

  if (!ready || !portfolio) {
    return <div className="max-w-[1400px] mx-auto px-6 py-12 text-[var(--color-text-faint)]">loading…</div>;
  }

  const equity = totalEquity(portfolio, prices);
  const totalPnl = equity - portfolio.startingCash;
  const totalPnlPct = portfolio.startingCash > 0 ? (totalPnl / portfolio.startingCash) * 100 : 0;
  const realized = totalRealizedPnl(portfolio);
  const unrealized = unrealizedPnl(portfolio, prices);
  const invested = positionsValue(portfolio, prices);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-10">
      {/* HERO P&L */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)] mb-2">
              Portfolio value
            </div>
            <div className="font-serif text-6xl tnum tracking-tight leading-none">
              {money(equity, { cents: true })}
            </div>
            <div
              className={cn(
                "mt-3 font-mono tnum text-base",
                totalPnl > 0
                  ? "text-[var(--color-up)]"
                  : totalPnl < 0
                  ? "text-[var(--color-down)]"
                  : "text-[var(--color-text-dim)]"
              )}
            >
              {totalPnl >= 0 ? "+" : ""}{money(totalPnl)}{" "}
              <span className="text-[var(--color-text-dim)]">·</span>{" "}
              {pct(totalPnlPct)}
              <span className="text-[var(--color-text-faint)] ml-3 text-xs uppercase tracking-wider">all time</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm("Reset your portfolio to $100,000? This wipes all trades.")) reset();
              }}
              className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] px-3 py-1.5"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <Stat label="Cash" value={money(portfolio.cash)} sub={<TermLabel termKey="buyingPower">Buying power</TermLabel>} />
          <Stat label="Invested" value={money(invested)} sub="In positions" />
          <Stat
            label={<TermLabel termKey="unrealizedPnl">Unrealized</TermLabel>}
            value={(unrealized >= 0 ? "+" : "") + money(unrealized)}
            valueClass={
              unrealized > 0 ? "text-[var(--color-up)]" : unrealized < 0 ? "text-[var(--color-down)]" : ""
            }
            sub="Open positions"
          />
          <Stat
            label={<TermLabel termKey="realizedPnl">Realized</TermLabel>}
            value={(realized >= 0 ? "+" : "") + money(realized)}
            valueClass={
              realized > 0 ? "text-[var(--color-up)]" : realized < 0 ? "text-[var(--color-down)]" : ""
            }
            sub="Closed trades"
          />
        </div>
      </section>

      {/* POSITIONS */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="font-serif text-3xl">Positions</h2>
          <Link
            href="/portfolio"
            className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text)] flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <PositionsTable />
      </section>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* MOVERS */}
        <section className="space-y-4">
          <h2 className="font-serif text-3xl">Market movers</h2>
          {movers ? (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <MoverSection title="Top gainers" items={movers.gainers.slice(0, 5)} />
              <MoverSection title="Top losers" items={movers.losers.slice(0, 5)} />
              <MoverSection title="Most active" items={movers.mostActive.slice(0, 5)} />
            </div>
          ) : (
            <div className="text-xs text-[var(--color-text-faint)]">loading movers…</div>
          )}
        </section>

        {/* NEWS */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="font-serif text-3xl">Today's news</h2>
            <Link
              href="/news"
              className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text)] flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <NewsList limit={6} />
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
      <div className={cn("text-xl font-mono tnum", valueClass)}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-faint)]">{sub}</div>}
    </div>
  );
}

function MoverSection({ title, items }: { title: string; items: Array<{ symbol: string; price: number; changePct: number; shortName: string }> }) {
  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      <div className="px-5 pt-4 pb-2 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{title}</div>
      {items.map((m) => (
        <Link
          key={m.symbol}
          href={`/trade/${m.symbol}`}
          className="flex items-center justify-between px-5 py-2 hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono w-16 shrink-0">{m.symbol}</span>
            <span className="text-sm text-[var(--color-text-dim)] truncate">{m.shortName}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono tnum text-sm">${m.price.toFixed(2)}</span>
            <span
              className={cn(
                "font-mono tnum text-sm w-20 text-right",
                m.changePct > 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]"
              )}
            >
              {pct(m.changePct)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
