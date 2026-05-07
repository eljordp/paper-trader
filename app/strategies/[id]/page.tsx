import Link from "next/link";
import { notFound } from "next/navigation";
import { getStrategyStats } from "@/lib/strategies";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ArrowLeft, Pencil, Brain, Calendar, TrendingUp } from "lucide-react";
import StrategyCoachClient from "./coach-client";

export const dynamic = "force-dynamic";

export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stats = await getStrategyStats(id);
  if (!stats) notFound();
  const s = stats.strategy;
  const hasData = stats.closes > 0;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-10">
      <Link
        href="/strategies"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
      >
        <ArrowLeft className="w-3 h-3" /> Strategies
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Strategy
          </div>
          <h1 className="font-serif text-5xl tracking-tight leading-none">{s.name}</h1>
          {s.description && (
            <p className="text-base text-[var(--color-text-dim)] max-w-prose">
              {s.description}
            </p>
          )}
        </div>
        <Link
          href={`/strategies/${s.id}/edit`}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-sm transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Link>
      </header>

      {/* STATS */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--color-text-dim)]" />
          Performance
        </h2>
        {hasData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <Kpi
              label="Trades"
              value={String(stats.totalTrades)}
              sub={
                stats.trainingTrades > 0
                  ? `${stats.trainingTrades} training`
                  : `${stats.buys} entries`
              }
            />
            <Kpi
              label="Win rate"
              value={
                stats.winRate != null ? `${(stats.winRate * 100).toFixed(0)}%` : "—"
              }
              sub={`${stats.wins}W / ${stats.losses}L`}
            />
            <Kpi
              label="Avg R/R"
              value={stats.avgRR != null ? stats.avgRR.toFixed(2) : "—"}
              sub="reward : risk"
            />
            <Kpi
              label="Expectancy"
              value={
                stats.expectancy != null
                  ? `${stats.expectancy >= 0 ? "+" : ""}${money(stats.expectancy, { cents: false })}`
                  : "—"
              }
              sub="per trade"
              valueClass={
                stats.expectancy != null && stats.expectancy > 0
                  ? "text-[var(--color-up)]"
                  : stats.expectancy != null && stats.expectancy < 0
                  ? "text-[var(--color-down)]"
                  : ""
              }
            />
            <Kpi
              label="Total realized"
              value={
                stats.totalRealized >= 0
                  ? `+${money(stats.totalRealized, { cents: false })}`
                  : money(stats.totalRealized, { cents: false })
              }
              valueClass={
                stats.totalRealized > 0
                  ? "text-[var(--color-up)]"
                  : stats.totalRealized < 0
                  ? "text-[var(--color-down)]"
                  : ""
              }
            />
            <Kpi
              label="Largest win"
              value={
                stats.largestWin != null
                  ? `+${money(stats.largestWin, { cents: false })}`
                  : "—"
              }
              valueClass="text-[var(--color-up)]"
            />
            <Kpi
              label="Largest loss"
              value={
                stats.largestLoss != null ? money(stats.largestLoss, { cents: false }) : "—"
              }
              valueClass="text-[var(--color-down)]"
            />
            <Kpi
              label="Last trade"
              value={
                stats.lastTradedAt
                  ? new Date(stats.lastTradedAt).toLocaleDateString()
                  : "—"
              }
            />
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-8 text-center text-sm text-[var(--color-text-dim)]">
            No closed trades yet. Tag a trade to this strategy on the trade ticket to start
            building stats.
          </div>
        )}
      </section>

      {/* BRAIN COACH */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl flex items-center gap-2">
          <Brain className="w-4 h-4 text-[var(--color-text-dim)]" />
          Brain coach
        </h2>
        <StrategyCoachClient strategyId={s.id} hasTrades={stats.closes > 0} />
      </section>

      {/* RULES */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Rules</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <RuleBlock label="Entry" content={s.entry_rules} />
          <RuleBlock label="Exit" content={s.exit_rules} />
          <RuleBlock label="Position sizing" content={s.size_rules} />
          <RuleBlock label="Time window" content={s.time_window} />
        </div>
        {s.instruments && s.instruments.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              Instruments
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.instruments.map((inst) => (
                <span
                  key={inst}
                  className="font-mono text-xs px-2 py-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)]"
                >
                  {inst}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className={cn("text-xl font-mono tnum", valueClass)}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-faint)]">{sub}</div>}
    </div>
  );
}

function RuleBlock({ label, content }: { label: string; content: string | null }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <pre className="text-sm text-[var(--color-text-dim)] whitespace-pre-wrap font-sans leading-relaxed">
        {content ?? <span className="italic text-[var(--color-text-faint)]">Not set</span>}
      </pre>
    </div>
  );
}
