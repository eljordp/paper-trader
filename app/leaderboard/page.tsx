import { adminClient } from "@/lib/admin";
import { TIERS, type Tier } from "@/lib/tiers";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { Trophy, Medal, Award } from "lucide-react";

export const dynamic = "force-dynamic";

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
  return_pct: number;
};

async function fetchLeaderboard(filter: Tier | "all" = "all"): Promise<LeaderRow[]> {
  const sb = adminClient();

  // Pull all accounts with eval rules (Phase 1, Phase 2, Funded), join profiles, aggregate trades
  let query = sb
    .from("accounts")
    .select(
      "id, user_id, tier, starting_cash, cash, status, profiles!inner(display_name, plan)"
    )
    .in("status", ["active", "passed"]);
  if (filter !== "all") {
    query = query.eq("tier", filter);
  } else {
    query = query.in("tier", ["phase1", "phase2", "pro"]);
  }
  const { data: accounts } = await query.limit(200);

  if (!accounts || accounts.length === 0) return [];

  // Aggregate realized P&L + trade count per account
  const accountIds = accounts.map((a) => (a as { id: string }).id);
  const { data: trades } = await sb
    .from("trades")
    .select("account_id, realized_pnl")
    .in("account_id", accountIds);

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
      return_pct: returnPct,
    };
  });

  // Best account per user (highest return_pct), then sort overall by return_pct
  const bestByUser = new Map<string, LeaderRow>();
  for (const r of rows) {
    const existing = bestByUser.get(r.user_id);
    if (!existing || r.return_pct > existing.return_pct) {
      bestByUser.set(r.user_id, r);
    }
  }
  return Array.from(bestByUser.values())
    .sort((a, b) => b.return_pct - a.return_pct)
    .slice(0, 50);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const sp = await searchParams;
  const filter = ((sp.tier as Tier | "all") ?? "all") as Tier | "all";
  const rows = await fetchLeaderboard(filter);

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Leaderboard
        </div>
        <h1 className="font-serif text-5xl mt-1">Top traders</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          Ranked by % return on your active eval account. Pass faster, climb higher.
        </p>
      </div>

      {/* Tier filter */}
      <div className="flex flex-wrap gap-2">
        <FilterPill label="All eval tiers" tier="all" current={filter} />
        <FilterPill label="Phase 1 · $50K" tier="phase1" current={filter} />
        <FilterPill label="Phase 2 · $100K" tier="phase2" current={filter} />
        <FilterPill label="Funded · $150K" tier="pro" current={filter} />
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
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[60px_2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>Rank</div>
              <div>Trader</div>
              <div>Tier</div>
              <div className="text-right">Return</div>
              <div className="text-right">Trades</div>
              <div className="text-right">Win rate</div>
            </div>
            {rows.map((r, i) => {
              const tierCfg = TIERS[r.tier];
              const isPodium = i < 3;
              return (
                <div
                  key={r.user_id}
                  className={cn(
                    "grid grid-cols-[60px_2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 border-b border-[var(--color-border)] last:border-b-0 items-center text-sm",
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
                      r.return_pct > 0
                        ? "text-[var(--color-up)]"
                        : r.return_pct < 0
                        ? "text-[var(--color-down)]"
                        : "text-[var(--color-text-dim)]"
                    )}
                  >
                    {pct(r.return_pct)}
                  </div>
                  <div className="text-right tnum font-mono text-[var(--color-text-dim)]">
                    {r.trade_count}
                  </div>
                  <div className="text-right tnum font-mono text-[var(--color-text-dim)]">
                    {r.win_rate != null ? `${(r.win_rate * 100).toFixed(0)}%` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  tier,
  current,
}: {
  label: string;
  tier: Tier | "all";
  current: Tier | "all";
}) {
  const active = tier === current;
  const href = tier === "all" ? "/leaderboard" : `/leaderboard?tier=${tier}`;
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 text-xs uppercase tracking-wider rounded-full transition-colors",
        active
          ? "bg-[var(--color-text)] text-[var(--color-bg)] font-medium"
          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)]"
      )}
    >
      {label}
    </Link>
  );
}
