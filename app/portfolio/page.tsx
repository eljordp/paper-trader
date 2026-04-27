"use client";

import PositionsTable from "@/components/PositionsTable";
import { usePortfolio } from "@/components/PortfolioProvider";
import { useEffect, useState } from "react";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function PortfolioPage() {
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

  if (!snapshot || !snapshot.activeAccount) return null;

  const account = snapshot.activeAccount;
  const cash = Number(account.cash);
  const invested = snapshot.positions.reduce((a, p) => {
    const px = prices[p.ticker] ?? Number(p.avg_cost);
    return a + Number(p.shares) * px;
  }, 0);
  const equity = cash + invested;
  const totalPnl = equity - Number(account.starting_cash);
  const totalPnlPct = Number(account.starting_cash) > 0 ? (totalPnl / Number(account.starting_cash)) * 100 : 0;
  const realized = snapshot.trades.reduce((a, t) => a + Number(t.realized_pnl ?? 0), 0);
  const unrealized = snapshot.positions.reduce((a, p) => {
    const px = prices[p.ticker];
    if (!Number.isFinite(px)) return a;
    return a + Number(p.shares) * (px - Number(p.avg_cost));
  }, 0);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      <h1 className="font-serif text-5xl">Portfolio</h1>

      <section className="grid grid-cols-2 md:grid-cols-6 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <Cell label="Equity" value={money(equity)} />
        <Cell label="Cash" value={money(cash)} />
        <Cell label="Invested" value={money(invested)} />
        <Cell
          label="P&L (all time)"
          value={(totalPnl >= 0 ? "+" : "") + money(totalPnl)}
          sub={pct(totalPnlPct)}
          color={totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : null}
        />
        <Cell
          label="Unrealized"
          value={(unrealized >= 0 ? "+" : "") + money(unrealized)}
          color={unrealized > 0 ? "up" : unrealized < 0 ? "down" : null}
        />
        <Cell
          label="Realized"
          value={(realized >= 0 ? "+" : "") + money(realized)}
          color={realized > 0 ? "up" : realized < 0 ? "down" : null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Open positions</h2>
        <PositionsTable />
      </section>
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "up" | "down" | null;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
      <div
        className={cn(
          "text-lg font-mono tnum",
          color === "up" && "text-[var(--color-up)]",
          color === "down" && "text-[var(--color-down)]"
        )}
      >
        {value}
      </div>
      {sub && (
        <div
          className={cn(
            "text-xs font-mono",
            color === "up" && "text-[var(--color-up)]",
            color === "down" && "text-[var(--color-down)]",
            !color && "text-[var(--color-text-faint)]"
          )}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
