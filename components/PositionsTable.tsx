"use client";

import Link from "next/link";
import { usePortfolio } from "./PortfolioProvider";
import { useEffect, useState } from "react";
import { money, pct, pnlColor, shares as fmtShares } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function PositionsTable() {
  const snapshot = usePortfolio();
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!snapshot?.positions || snapshot.positions.length === 0) return;
    const symbols = snapshot.positions.map((p) => p.ticker).join(",");
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
  }, [snapshot]);

  if (!snapshot || snapshot.positions.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
        <div className="text-[var(--color-text-dim)] mb-1">No open positions</div>
        <div className="text-xs text-[var(--color-text-faint)]">Search any ticker to make your first trade</div>
      </div>
    );
  }

  const rows = snapshot.positions.map((pos) => {
    const px = prices[pos.ticker];
    const isShort = pos.side === "short";
    const value = (px ?? Number(pos.avg_cost)) * Number(pos.shares);
    const cost = Number(pos.avg_cost) * Number(pos.shares);
    // Long pnl = value - cost; Short pnl = cost - value
    const pnl = isShort ? cost - value : value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { pos, px, value, cost, pnl, pnlPct, isShort };
  });

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      {/* Header — desktop columns; mobile shows simplified header */}
      <div className="hidden sm:grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        <div>Ticker</div>
        <div className="text-right">Shares</div>
        <div className="text-right">Avg Cost</div>
        <div className="text-right">Last</div>
        <div className="text-right">Market Value</div>
        <div className="text-right">P&L</div>
      </div>
      <div className="sm:hidden grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        <div>Ticker</div>
        <div className="text-right">Value</div>
        <div className="text-right">P&L</div>
      </div>
      {rows.map(({ pos, px, value, pnl, pnlPct, isShort }) => (
        <Link
          key={pos.id}
          href={`/trade/${pos.ticker}`}
          className="block hover:bg-[var(--color-surface-2)] transition-colors border-b border-[var(--color-border)] last:border-b-0"
        >
          {/* Desktop row */}
          <div className="hidden sm:grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-4 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{pos.ticker}</span>
              {isShort && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-down)]/15 text-[var(--color-down)] border border-[var(--color-down)]/30">
                  Short
                </span>
              )}
            </div>
            <div className="text-right tnum font-mono text-sm">{fmtShares(Number(pos.shares))}</div>
            <div className="text-right tnum font-mono text-sm text-[var(--color-text-dim)]">{money(Number(pos.avg_cost))}</div>
            <div className="text-right tnum font-mono text-sm">{px ? money(px) : "—"}</div>
            <div className="text-right tnum font-mono text-sm">{money(value)}</div>
            <div className={cn("text-right tnum font-mono text-sm", pnlColor(pnl))}>
              <div>{pnl >= 0 ? "+" : ""}{money(pnl)}</div>
              <div className="text-[11px] opacity-80">{pct(pnlPct)}</div>
            </div>
          </div>
          {/* Mobile row — compact 3 cols */}
          <div className="sm:hidden grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3.5 items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-medium">{pos.ticker}</span>
                {isShort && (
                  <span className="text-[8px] uppercase tracking-wider px-1 rounded bg-[var(--color-down)]/15 text-[var(--color-down)]">
                    S
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--color-text-faint)] tnum font-mono">
                {fmtShares(Number(pos.shares))} @ {money(Number(pos.avg_cost))}
              </div>
            </div>
            <div className="text-right tnum font-mono text-sm">{money(value)}</div>
            <div className={cn("text-right tnum font-mono text-sm min-w-[72px]", pnlColor(pnl))}>
              <div>{pnl >= 0 ? "+" : ""}{money(pnl, { cents: false })}</div>
              <div className="text-[11px] opacity-80">{pct(pnlPct)}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
