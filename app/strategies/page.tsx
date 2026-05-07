import Link from "next/link";
import { listStrategyStats } from "@/lib/strategies";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Plus, Brain, Target, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StrategiesPage() {
  const stats = await listStrategyStats();

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Your playbook
          </div>
          <h1 className="font-serif text-5xl mt-1">Strategies</h1>
          <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
            Define your setups. Tag every trade. The brain studies what works for you,
            tells you what to do more of and what to drop.
          </p>
        </div>
        <Link
          href="/strategies/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          New strategy
        </Link>
      </div>

      {stats.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center space-y-3">
          <Brain className="w-8 h-8 text-[var(--color-text-faint)] mx-auto" />
          <div className="font-serif text-2xl">No strategies yet</div>
          <p className="text-sm text-[var(--color-text-dim)] max-w-prose mx-auto">
            Start by writing down what you actually do. One strategy = one named setup
            with entry rules, exit rules, position sizing.
          </p>
          <Link
            href="/strategies/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium mt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first strategy
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {stats.map((s) => (
            <StrategyCard key={s.strategy.id} stats={s} />
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--color-text-dim)]" />
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
            Training mode
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">
          Toggle &quot;Training&quot; on the trade ticket when you&apos;re testing a new
          strategy. Training trades count toward your strategy stats but are tagged
          separately so you know which trades were real vs. practice. Use small size
          (0.25%–0.5% R) until you have 20+ trades and a confirmed edge.
        </p>
      </div>
    </div>
  );
}

function StrategyCard({ stats }: { stats: Awaited<ReturnType<typeof listStrategyStats>>[number] }) {
  const s = stats.strategy;
  const profitable = stats.totalRealized > 0;
  const hasData = stats.closes > 0;

  return (
    <Link
      href={`/strategies/${s.id}`}
      className="block bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4 hover:border-[var(--color-border-strong)] hover:-translate-y-0.5 transition-all"
    >
      <div className="space-y-1">
        <h3 className="font-serif text-2xl">{s.name}</h3>
        {s.description && (
          <p className="text-sm text-[var(--color-text-dim)] line-clamp-2">
            {s.description}
          </p>
        )}
      </div>

      {hasData ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Win rate"
              value={
                stats.winRate != null
                  ? `${(stats.winRate * 100).toFixed(0)}%`
                  : "—"
              }
              sub={`${stats.wins}W / ${stats.losses}L`}
            />
            <Stat
              label="Avg R/R"
              value={stats.avgRR != null ? `${stats.avgRR.toFixed(2)}` : "—"}
              sub="reward : risk"
            />
            <Stat
              label="Expectancy"
              value={
                stats.expectancy != null
                  ? `${stats.expectancy >= 0 ? "+" : ""}${money(stats.expectancy, { cents: false })}`
                  : "—"
              }
              sub="per trade"
              valueClass={
                stats.expectancy != null
                  ? stats.expectancy > 0
                    ? "text-[var(--color-up)]"
                    : "text-[var(--color-down)]"
                  : ""
              }
            />
          </div>
          <div className="hairline pt-3 flex items-center justify-between">
            <div className="text-[11px] text-[var(--color-text-faint)]">
              <span className="font-mono">{stats.totalTrades}</span> trades
              {stats.trainingTrades > 0 && (
                <span className="ml-1.5 text-[var(--color-cyan)]">
                  · {stats.trainingTrades} training
                </span>
              )}
            </div>
            <div
              className={cn(
                "font-mono tnum text-sm",
                profitable
                  ? "text-[var(--color-up)]"
                  : stats.totalRealized < 0
                  ? "text-[var(--color-down)]"
                  : "text-[var(--color-text-dim)]"
              )}
            >
              {stats.totalRealized >= 0 ? "+" : ""}
              {money(stats.totalRealized, { cents: false })}
            </div>
          </div>
        </>
      ) : (
        <div className="text-sm text-[var(--color-text-faint)]">
          No trades tagged yet — pick this on your next trade ticket.
        </div>
      )}
    </Link>
  );
}

function Stat({
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
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className={cn("text-base font-mono tnum mt-0.5", valueClass)}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--color-text-faint)]">{sub}</div>}
    </div>
  );
}
