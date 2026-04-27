"use client";

import Link from "next/link";
import { usePortfolio } from "@/components/PortfolioProvider";
import { money, pnlColor, shares as fmtShares } from "@/lib/format";
import { cn } from "@/lib/cn";
import { format } from "date-fns";

export default function HistoryPage() {
  const snapshot = usePortfolio();
  if (!snapshot) return null;
  const trades = snapshot.trades;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      <h1 className="font-serif text-5xl">Trade history</h1>

      {trades.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
          <div className="text-[var(--color-text-dim)] mb-1">No trades yet</div>
          <div className="text-xs text-[var(--color-text-faint)]">Search a ticker and place your first trade.</div>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.6fr_1fr_0.8fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            <div>Date</div>
            <div>Side</div>
            <div>Ticker</div>
            <div className="text-right">Shares</div>
            <div className="text-right">Price</div>
            <div className="text-right">Total</div>
            <div className="text-right">Realized P&L</div>
          </div>
          {trades.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[1.2fr_0.6fr_1fr_0.8fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 text-sm"
            >
              <div className="text-[var(--color-text-dim)] text-xs">
                {format(new Date(t.created_at), "MMM d, h:mm a")}
              </div>
              <div>
                <span
                  className={cn(
                    "inline-block text-[10px] uppercase font-medium tracking-wider px-1.5 py-0.5 rounded",
                    t.side === "buy"
                      ? "bg-[var(--color-up)]/10 text-[var(--color-up)]"
                      : "bg-[var(--color-down)]/10 text-[var(--color-down)]"
                  )}
                >
                  {t.side}
                </span>
              </div>
              <Link href={`/trade/${t.ticker}`} className="font-mono hover:underline">
                {t.ticker}
              </Link>
              <div className="text-right tnum font-mono">{fmtShares(Number(t.shares))}</div>
              <div className="text-right tnum font-mono">{money(Number(t.price))}</div>
              <div className="text-right tnum font-mono">{money(Number(t.total))}</div>
              <div className={cn("text-right tnum font-mono", t.realized_pnl != null ? pnlColor(Number(t.realized_pnl)) : "text-[var(--color-text-faint)]")}>
                {t.realized_pnl != null ? `${Number(t.realized_pnl) >= 0 ? "+" : ""}${money(Number(t.realized_pnl))}` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
