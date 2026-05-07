import { adminClient } from "@/lib/admin";
import { TIERS, type Tier } from "@/lib/tiers";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { Trophy, Medal, Award } from "lucide-react";

export const dynamic = "force-dynamic";

type Period = "all" | "week" | "month";

type LeaderRow = {
  user_id: string;
  display_name: string;
  tier: Tier;
  starting_cash: number;
  cash: number;
  status: string;
  realized_pnl: number;
  trade_count: number;
  win_rate: number | null;
  rank_metric: number; // % return for "all", $ realized for week/month
};

function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (period === "week") {
    // Monday 00:00 UTC current week
    const day = d.getUTCDay(); // 0=Sun, 1=Mon...
    const diff = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diff);
  } else {
    d.setUTCDate(d.getUTCDate() - 30);
  }
  return d;
}

async function fetchLeaderboard(
  filter: Tier | "all" = "all",
  period: Period = "all"
): Promise<LeaderRow[]> {
  const sb = adminClient();

  let query = sb
    .from("accounts")
    .select(
      "id, user_id, tier, starting_cash, cash, status, profiles!inner(display_name)"
    )
    .in("status", ["active", "passed"]);
  if (filter !== "all") {
    query = query.eq("tier", filter);
  } else {
    query = query.in("tier", ["phase1", "phase2", "pro"]);
  }
  const { data: accounts } = await query.limit(500);

  if (!accounts || accounts.length === 0) return [];

  const accountIds = accounts.map((a) => (a as { id: string }).id);
  let tradesQuery = sb
    .from("trades")
    .select("account_id, realized_pnl, created_at")
    .in("account_id", accountIds);
  const ps = periodStart(period);
  if (ps) tradesQuery = tradesQuery.gte("created_at", ps.toISOString());
  const { data: trades } = await tradesQuery;

  const stats: Record<string, { realized: number; total: number; wins: number }> = {};
  ((trades ?? []) as Array<{ account_id: string; realized_pnl: number | null }>).forEach((t) => {
    if (!stats[t.account_id]) stats[t.account_id] = { realized: 0, total: 0, wins: 0 };
    if (t.realized_pnl != null) {
      stats[t.account_id].realized += Number(t.realized_pnl);
      stats[t.account_id].total += 1;
      if (Number(t.realized_pnl) > 0) stats[t.account_id].wins += 1;
    }
  });

  const rows: LeaderRow[] = accounts.map((a) => {
    const acc = a as unknown as {
      id: string;
      user_id: string;
      tier: Tier;
      starting_cash: number;
      cash: number;
      status: string;
      profiles: { display_name: string | null } | { display_name: string | null }[];
    };
    const profile = Array.isArray(acc.profiles) ? acc.profiles[0] : acc.profiles;
    const s = stats[acc.id] ?? { realized: 0, total: 0, wins: 0 };
    const startingCash = Number(acc.starting_cash);
    const cash = Number(acc.cash);
    const returnPct = startingCash > 0 ? ((cash - startingCash) / startingCash) * 100 : 0;
    const rankMetric = period === "all" ? returnPct : s.realized;
    return {
      user_id: acc.user_id,
      display_name: profile?.display_name ?? "anonymous",
      tier: acc.tier,
      starting_cash: startingCash,
      cash,
      status: acc.status,
      realized_pnl: s.realized,
      trade_count: s.total,
      win_rate: s.total > 0 ? s.wins / s.total : null,
      rank_metric: rankMetric,
    };
  });

  // Best account per user (highest rank_metric)
  const bestByUser = new Map<string, LeaderRow>();
  for (const r of rows) {
    const existing = bestByUser.get(r.user_id);
    if (!existing || r.rank_metric > existing.rank_metric) {
      bestByUser.set(r.user_id, r);
    }
  }
  return Array.from(bestByUser.values())
    .filter((r) => period === "all" ? true : r.trade_count > 0)
    .sort((a, b) => b.rank_metric - a.rank_metric)
    .slice(0, 50);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const filter = ((sp.tier as Tier | "all") ?? "all") as Tier | "all";
  const period = ((sp.period as Period) ?? "all") as Period;
  const rows = await fetchLeaderboard(filter, period);

  const periodLabel =
    period === "week"
      ? "This week's"
      : period === "month"
      ? "Last 30 days"
      : "All-time";

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          {periodLabel} leaderboard
        </div>
        <h1 className="font-serif text-5xl mt-1">Top traders</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          {period === "all"
            ? "Ranked by % return on your active eval account. Pass faster, climb higher."
            : "Ranked by realized P&L during the period. Resets every Monday."}
        </p>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2">
        <PillSet
          options={[
            { label: "All time", value: "all" },
            { label: "This week", value: "week" },
            { label: "Last 30 days", value: "month" },
          ]}
          current={period}
          paramName="period"
          otherParams={filter !== "all" ? { tier: filter } : {}}
        />
      </div>

      {/* Tier filter */}
      <div className="flex flex-wrap gap-2">
        <PillSet
          options={[
            { label: "All eval tiers", value: "all" },
            { label: "Phase 1 · $50K", value: "phase1" },
            { label: "Phase 2 · $100K", value: "phase2" },
            { label: "Funded · $150K", value: "pro" },
          ]}
          current={filter}
          paramName="tier"
          otherParams={period !== "all" ? { period } : {}}
        />
      </div>

      {rows.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
          <div className="text-[var(--color-text-dim)] mb-1">No ranked traders yet</div>
          <div className="text-xs text-[var(--color-text-faint)]">
            Be the first. Spin up a Phase 1 account at /accounts.
          </div>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[60px_2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>Rank</div>
              <div>Trader</div>
              <div>Tier</div>
              <div className="text-right">{period === "all" ? "Return" : "P&L"}</div>
              <div className="text-right">Trades</div>
              <div className="text-right">Win rate</div>
            </div>
            {rows.map((r, i) => {
              const tierCfg = TIERS[r.tier];
              const isPodium = i < 3;
              return (
                <Link
                  key={r.user_id}
                  href={`/u/${r.user_id}`}
                  className={cn(
                    "grid grid-cols-[60px_2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 border-b border-[var(--color-border)] last:border-b-0 items-center text-sm hover:bg-[var(--color-surface-2)] transition-colors",
                    isPodium && "bg-gradient-to-r from-[var(--color-pro)]/5 to-transparent"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {i === 0 && <Trophy className="w-4 h-4 text-[var(--color-gold)]" />}
                    {i === 1 && <Medal className="w-4 h-4 text-[var(--color-text-dim)]" />}
                    {i === 2 && <Award className="w-4 h-4 text-[var(--color-pro)]" />}
                    <span
                      className={cn(
                        "font-mono tnum",
                        isPodium && "font-bold text-[var(--color-text)]"
                      )}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div className="font-mono">{r.display_name}</div>
                  <div>
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        color: tierCfg.color,
                        background: `rgba(${tierCfg.colorRgb}, 0.12)`,
                        border: `1px solid rgba(${tierCfg.colorRgb}, 0.4)`,
                      }}
                    >
                      {tierCfg.name}
                    </span>
                    {r.status === "passed" && (
                      <span className="ml-1.5 text-[9px] uppercase text-[var(--color-up)]">
                        passed
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "text-right tnum font-mono",
                      r.rank_metric > 0
                        ? "text-[var(--color-up)]"
                        : r.rank_metric < 0
                        ? "text-[var(--color-down)]"
                        : "text-[var(--color-text-dim)]"
                    )}
                  >
                    {period === "all"
                      ? pct(r.rank_metric)
                      : `${r.rank_metric >= 0 ? "+" : ""}${money(r.rank_metric, { cents: false })}`}
                  </div>
                  <div className="text-right tnum font-mono text-[var(--color-text-dim)]">
                    {r.trade_count}
                  </div>
                  <div className="text-right tnum font-mono text-[var(--color-text-dim)]">
                    {r.win_rate != null ? `${(r.win_rate * 100).toFixed(0)}%` : "—"}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PillSet({
  options,
  current,
  paramName,
  otherParams,
}: {
  options: { label: string; value: string }[];
  current: string;
  paramName: string;
  otherParams: Record<string, string>;
}) {
  return (
    <>
      {options.map((opt) => {
        const active = opt.value === current;
        const params = new URLSearchParams(otherParams);
        if (opt.value !== "all") params.set(paramName, opt.value);
        const qs = params.toString();
        const href = `/leaderboard${qs ? `?${qs}` : ""}`;
        return (
          <Link
            key={opt.value}
            href={href}
            className={cn(
              "px-3 py-1.5 text-xs uppercase tracking-wider rounded-full transition-colors",
              active
                ? "bg-[var(--color-text)] text-[var(--color-bg)] font-medium"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)]"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </>
  );
}
