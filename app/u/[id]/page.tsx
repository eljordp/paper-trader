import { adminClient } from "@/lib/admin";
import { TIERS, type Tier, TIER_ORDER } from "@/lib/tiers";
import { ROLES, type Role } from "@/lib/roles";
import { money, pct } from "@/lib/format";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, AlertTriangle } from "lucide-react";
import ShareButton from "./share-button";

export const dynamic = "force-dynamic";

export default async function UserProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = adminClient();

  const { data: profile } = await sb
    .from("profiles")
    .select("id, display_name, roles, highest_tier_unlocked, plan, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();
  const p = profile as {
    id: string;
    display_name: string | null;
    roles: string[] | null;
    highest_tier_unlocked: Tier;
    plan: string | null;
    created_at: string;
  };

  // All accounts for this user
  const { data: accountsRaw } = await sb
    .from("accounts")
    .select("id, tier, starting_cash, cash, status, passed_at, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: true });
  const accounts =
    (accountsRaw ?? []) as Array<{
      id: string;
      tier: Tier;
      starting_cash: number;
      cash: number;
      status: "active" | "passed" | "failed";
      passed_at: string | null;
      created_at: string;
    }>;

  const accountIds = accounts.map((a) => a.id);

  // Trades aggregate
  const { data: tradesRaw } = await sb
    .from("trades")
    .select("realized_pnl, account_id")
    .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);
  const trades = (tradesRaw ?? []) as Array<{ realized_pnl: number | null; account_id: string }>;
  const closes = trades.filter((t) => t.realized_pnl != null);
  const wins = closes.filter((t) => Number(t.realized_pnl) > 0);
  const totalRealized = closes.reduce((acc, t) => acc + Number(t.realized_pnl ?? 0), 0);
  const winRate = closes.length > 0 ? wins.length / closes.length : null;

  // Best account by % return
  const bestAccount = accounts
    .map((a) => ({
      ...a,
      returnPct:
        Number(a.starting_cash) > 0
          ? ((Number(a.cash) - Number(a.starting_cash)) / Number(a.starting_cash)) * 100
          : 0,
    }))
    .sort((a, b) => b.returnPct - a.returnPct)[0];

  const passedTiers = accounts
    .filter((a) => a.status === "passed")
    .map((a) => a.tier);
  const passedSet = new Set(passedTiers);

  const memberSince = format(new Date(p.created_at), "MMM yyyy");
  const displayName = p.display_name ?? "anonymous";

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-10">
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
      >
        <ArrowLeft className="w-3 h-3" /> Leaderboard
      </Link>

      {/* HEADER */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(p.roles ?? []).map((r) => {
                const cfg = ROLES[r as Role];
                if (!cfg) return null;
                return (
                  <span
                    key={r}
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium"
                    style={{
                      color: cfg.color,
                      background: `rgba(${cfg.colorRgb}, 0.12)`,
                      border: `1px solid rgba(${cfg.colorRgb}, 0.4)`,
                    }}
                  >
                    {cfg.label}
                  </span>
                );
              })}
            </div>
            <h1 className="font-serif text-6xl tracking-tight leading-none">{displayName}</h1>
            <div className="text-sm text-[var(--color-text-dim)]">
              Trader since {memberSince}
            </div>
          </div>
          <ShareButton displayName={displayName} userId={p.id} />
        </div>
      </header>

      {/* TIER BADGES */}
      <section className="space-y-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Eval ladder progress
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TIER_ORDER.map((tier) => {
            const cfg = TIERS[tier];
            const passed = passedSet.has(tier);
            const unlocked =
              p.highest_tier_unlocked === "elite" ||
              TIER_ORDER.indexOf(tier) <=
                TIER_ORDER.indexOf(p.highest_tier_unlocked);
            return (
              <div
                key={tier}
                className="bg-[var(--color-surface)] rounded-lg p-4 space-y-2"
                style={{
                  border: passed
                    ? `1px solid rgba(${cfg.colorRgb}, 0.6)`
                    : unlocked
                    ? `1px solid rgba(${cfg.colorRgb}, 0.3)`
                    : "1px solid var(--color-border)",
                  boxShadow: passed
                    ? `0 0 30px -12px rgba(${cfg.colorRgb}, 0.5)`
                    : undefined,
                  opacity: unlocked ? 1 : 0.5,
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="text-[10px] uppercase tracking-wider font-medium"
                    style={{ color: unlocked ? cfg.color : "var(--color-text-faint)" }}
                  >
                    {cfg.name}
                  </div>
                  {passed && <Trophy className="w-3.5 h-3.5 text-[var(--color-up)]" />}
                </div>
                <div className="font-mono tnum text-2xl">${(cfg.startingCash / 1000).toFixed(0)}K</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                  {passed ? "Passed" : unlocked ? "Unlocked" : "Locked"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* STATS */}
      <section className="space-y-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          All-time stats
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <Stat label="Total trades" value={String(trades.length)} />
          <Stat
            label="Win rate"
            value={winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
            sub={`${wins.length}W / ${closes.length - wins.length}L`}
          />
          <Stat
            label="Total realized"
            value={totalRealized >= 0 ? `+${money(totalRealized, { cents: false })}` : money(totalRealized, { cents: false })}
            valueClass={
              totalRealized > 0
                ? "text-[var(--color-up)]"
                : totalRealized < 0
                ? "text-[var(--color-down)]"
                : ""
            }
          />
          <Stat
            label="Best account"
            value={bestAccount ? `${pct(bestAccount.returnPct)}` : "—"}
            sub={bestAccount ? `${TIERS[bestAccount.tier].name}` : ""}
            valueClass={
              bestAccount && bestAccount.returnPct > 0
                ? "text-[var(--color-up)]"
                : bestAccount && bestAccount.returnPct < 0
                ? "text-[var(--color-down)]"
                : ""
            }
          />
        </div>
      </section>

      {/* ACCOUNTS LIST */}
      {accounts.length > 0 && (
        <section className="space-y-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Accounts
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            {accounts.map((a) => {
              const cfg = TIERS[a.tier];
              const returnPct =
                Number(a.starting_cash) > 0
                  ? ((Number(a.cash) - Number(a.starting_cash)) / Number(a.starting_cash)) * 100
                  : 0;
              return (
                <div
                  key={a.id}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 items-center text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        color: cfg.color,
                        background: `rgba(${cfg.colorRgb}, 0.12)`,
                        border: `1px solid rgba(${cfg.colorRgb}, 0.4)`,
                      }}
                    >
                      {cfg.name}
                    </span>
                  </div>
                  <div className="font-mono tnum text-[var(--color-text-dim)]">
                    ${(Number(a.starting_cash) / 1000).toFixed(0)}K
                  </div>
                  <div>
                    {a.status === "passed" && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-up)]">
                        <Trophy className="w-3 h-3" /> Passed
                      </span>
                    )}
                    {a.status === "failed" && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-down)]">
                        <AlertTriangle className="w-3 h-3" /> Failed
                      </span>
                    )}
                    {a.status === "active" && (
                      <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                        Active
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "text-right tnum font-mono",
                      returnPct > 0
                        ? "text-[var(--color-up)]"
                        : returnPct < 0
                        ? "text-[var(--color-down)]"
                        : "text-[var(--color-text-dim)]"
                    )}
                  >
                    {pct(returnPct)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
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
    <div className="bg-[var(--color-surface)] p-5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className={`text-xl font-mono tnum ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-faint)]">{sub}</div>}
    </div>
  );
}

function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}
