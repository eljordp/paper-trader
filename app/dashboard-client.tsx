"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortfolio } from "@/components/PortfolioProvider";
import PositionsTable from "@/components/PositionsTable";
import NewsList from "@/components/NewsList";
import EquityCurve from "@/components/EquityCurve";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TermLabel } from "@/components/Tooltip";
import { ArrowRight, Trophy, AlertTriangle } from "lucide-react";
import { TIERS, type Tier, computeEvalStatus } from "@/lib/tiers";
import { resetActiveAccount } from "@/lib/actions";

export default function DashboardClient({
  equitySnapshots,
}: {
  equitySnapshots: Array<{ recorded_at: string; equity: number }>;
}) {
  const snapshot = usePortfolio();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [movers, setMovers] = useState<{
    gainers: Array<{ symbol: string; price: number; changePct: number; shortName: string }>;
    losers: Array<{ symbol: string; price: number; changePct: number; shortName: string }>;
    mostActive: Array<{ symbol: string; price: number; changePct: number; shortName: string }>;
  } | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    const symbols = [
      ...snapshot.positions.map((p) => p.ticker),
      ...snapshot.watchlist,
    ].join(",");
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
  }, [snapshot]);

  useEffect(() => {
    fetch("/api/movers")
      .then((r) => r.json())
      .then((d) => setMovers(d))
      .catch(() => {});
  }, []);

  if (!snapshot || !snapshot.activeAccount) {
    return <div className="max-w-[1400px] mx-auto px-6 py-12 text-[var(--color-text-faint)]">loading…</div>;
  }

  const account = snapshot.activeAccount;
  const cash = Number(account.cash);
  const positionsValue = snapshot.positions.reduce((acc, p) => {
    const px = prices[p.ticker] ?? Number(p.avg_cost);
    return acc + Number(p.shares) * px;
  }, 0);
  const equity = cash + positionsValue;
  const totalPnl = equity - Number(account.starting_cash);
  const totalPnlPct = Number(account.starting_cash) > 0 ? (totalPnl / Number(account.starting_cash)) * 100 : 0;
  const realized = snapshot.trades.reduce((a, t) => a + Number(t.realized_pnl ?? 0), 0);
  const unrealized = snapshot.positions.reduce((a, p) => {
    const px = prices[p.ticker];
    if (!Number.isFinite(px)) return a;
    return a + Number(p.shares) * (px - Number(p.avg_cost));
  }, 0);

  const evalState = computeEvalStatus({
    tier: account.tier as Tier,
    startingCash: Number(account.starting_cash),
    currentEquity: equity,
    highWaterMark: Math.max(Number(account.high_water_mark), equity),
    tradingDays: Number(account.trading_days_count),
  });

  const tierConfig = TIERS[account.tier as Tier];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-10">
      {/* TIER + EVAL STATUS BAR */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/accounts"
                className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
              >
                {tierConfig.name} Account · ${(tierConfig.startingCash / 1000).toFixed(0)}K
              </Link>
              {account.status === "passed" && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-up)]/15 text-[var(--color-up)]">
                  <Trophy className="w-3 h-3" /> Passed
                </span>
              )}
              {account.status === "failed" && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-down)]/15 text-[var(--color-down)]">
                  <AlertTriangle className="w-3 h-3" /> Failed
                </span>
              )}
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

          <form action={async () => {
            if (typeof window !== "undefined" && !confirm(`Reset your ${tierConfig.name} account? Wipes all trades.`)) return;
            await resetActiveAccount();
          }}>
            <button type="submit" className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] px-3 py-1.5">
              Reset account
            </button>
          </form>
        </div>

        {/* EVAL PROGRESS BARS */}
        {(tierConfig.rules.profitTargetPct != null || tierConfig.rules.maxDrawdownPct != null) && (
          <div className="grid sm:grid-cols-3 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            {tierConfig.rules.profitTargetPct != null && (
              <ProgressTile
                label="Profit target"
                value={`${evalState.progress.profitPct.toFixed(2)}% / ${tierConfig.rules.profitTargetPct}%`}
                progress={Math.min(1, Math.max(0, evalState.progress.profitPct / tierConfig.rules.profitTargetPct))}
                color="up"
              />
            )}
            {tierConfig.rules.maxDrawdownPct != null && (
              <ProgressTile
                label="Drawdown"
                value={`${Math.max(0, evalState.progress.drawdownPct).toFixed(2)}% / ${tierConfig.rules.maxDrawdownPct}%`}
                progress={Math.min(1, Math.max(0, evalState.progress.drawdownPct / tierConfig.rules.maxDrawdownPct))}
                color="down"
              />
            )}
            {tierConfig.rules.minTradingDays != null && (
              <ProgressTile
                label="Trading days"
                value={`${Number(account.trading_days_count)} / ${tierConfig.rules.minTradingDays}`}
                progress={Math.min(1, Number(account.trading_days_count) / tierConfig.rules.minTradingDays)}
                color="neutral"
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <Stat label="Cash" value={money(cash)} sub={<TermLabel termKey="buyingPower">Buying power</TermLabel>} />
          <Stat label="Invested" value={money(positionsValue)} sub="In positions" />
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

      {/* EQUITY CURVE */}
      <section className="space-y-4">
        <h2 className="font-serif text-3xl">Equity curve</h2>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <EquityCurve
            snapshots={equitySnapshots}
            startingCash={Number(account.starting_cash)}
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

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="font-serif text-3xl">Today&apos;s news</h2>
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

function ProgressTile({
  label,
  value,
  progress,
  color,
}: {
  label: string;
  value: string;
  progress: number;
  color: "up" | "down" | "neutral";
}) {
  const barColor = color === "up" ? "bg-[var(--color-up)]" : color === "down" ? "bg-[var(--color-down)]" : "bg-[var(--color-text-dim)]";
  return (
    <div className="bg-[var(--color-surface)] p-4 space-y-2">
      <div className="flex justify-between items-baseline">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
        <div className="text-xs font-mono tnum text-[var(--color-text-dim)]">{value}</div>
      </div>
      <div className="h-1.5 w-full bg-[var(--color-bg)] rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", barColor)}
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
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
