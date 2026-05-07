import { requireOwner, adminClient } from "@/lib/admin";
import { money, pct } from "@/lib/format";
import { ROLES, type Role } from "@/lib/roles";
import { TIERS, type Tier } from "@/lib/tiers";
import { PLANS, type Plan } from "@/lib/plans";
import { format } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireOwner();
  const sb = adminClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const monthStart = new Date(now);
  monthStart.setUTCDate(monthStart.getUTCDate() - 30);

  // Counts
  const [
    { count: totalUsers },
    { count: signupsToday },
    { count: signupsThisWeek },
    { count: signupsThisMonth },
    { count: totalAccounts },
    { count: tradesToday },
    { count: tradesAllTime },
  ] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    sb
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStart.toISOString()),
    sb
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString()),
    sb.from("accounts").select("*", { count: "exact", head: true }),
    sb
      .from("trades")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    sb.from("trades").select("*", { count: "exact", head: true }),
  ]);

  // Plan breakdown
  const { data: planRows } = await sb.from("profiles").select("plan");
  const planCounts: Record<string, number> = { free: 0, pro: 0, vip: 0, enterprise: 0 };
  ((planRows ?? []) as Array<{ plan: string }>).forEach((r) => {
    planCounts[r.plan ?? "free"] = (planCounts[r.plan ?? "free"] ?? 0) + 1;
  });

  // Recent signups
  const { data: recent } = await sb
    .from("profiles")
    .select("id, email, display_name, plan, created_at, roles, trial_until")
    .order("created_at", { ascending: false })
    .limit(20);

  // Active accounts breakdown by tier
  const { data: tierRows } = await sb
    .from("accounts")
    .select("tier, status");
  const tierCounts: Record<string, { active: number; passed: number; failed: number }> = {};
  ((tierRows ?? []) as Array<{ tier: string; status: string }>).forEach((r) => {
    if (!tierCounts[r.tier]) tierCounts[r.tier] = { active: 0, passed: 0, failed: 0 };
    const s = r.status as "active" | "passed" | "failed";
    tierCounts[r.tier][s] = (tierCounts[r.tier][s] ?? 0) + 1;
  });

  // Estimated MRR
  const mrrUsd =
    (planCounts.pro ?? 0) * PLANS.pro.priceUsd +
    (planCounts.vip ?? 0) * PLANS.vip.priceUsd +
    (planCounts.enterprise ?? 0) * PLANS.enterprise.priceUsd;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-10">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Owner console
        </div>
        <h1 className="font-serif text-5xl mt-1">Admin</h1>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <Kpi label="Total users" value={String(totalUsers ?? 0)} />
        <Kpi label="Signups · today" value={String(signupsToday ?? 0)} />
        <Kpi label="Signups · 7d" value={String(signupsThisWeek ?? 0)} />
        <Kpi label="Signups · 30d" value={String(signupsThisMonth ?? 0)} />
        <Kpi label="Accounts" value={String(totalAccounts ?? 0)} />
        <Kpi label="Trades · today" value={String(tradesToday ?? 0)} />
        <Kpi label="Trades · all time" value={String(tradesAllTime ?? 0)} />
        <Kpi
          label="MRR (paid plans)"
          value={money(mrrUsd, { cents: false })}
          sub="Excludes trial users"
        />
      </section>

      {/* Plan breakdown */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Plans</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(PLANS) as Plan[]).map((p) => (
            <div
              key={p}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"
            >
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                {PLANS[p].name}
              </div>
              <div className="font-mono tnum text-2xl mt-1">{planCounts[p] ?? 0}</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {p !== "free" &&
                  money((planCounts[p] ?? 0) * PLANS[p].priceUsd, { cents: false }) +
                    "/mo"}
                {p === "free" && (
                  <span>
                    {totalUsers
                      ? `${(((planCounts.free ?? 0) / totalUsers) * 100).toFixed(0)}%`
                      : "—"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tier breakdown */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Accounts by tier</h2>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_repeat(3,1fr)] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            <div>Tier</div>
            <div className="text-right">Active</div>
            <div className="text-right">Passed</div>
            <div className="text-right">Failed</div>
          </div>
          {Object.keys(TIERS).map((t) => {
            const cfg = TIERS[t as Tier];
            const counts = tierCounts[t] ?? { active: 0, passed: 0, failed: 0 };
            return (
              <div
                key={t}
                className="grid grid-cols-[1fr_repeat(3,1fr)] gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 items-center"
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
                  <span className="text-xs text-[var(--color-text-faint)] tnum font-mono">
                    ${(cfg.startingCash / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="text-right tnum font-mono text-sm">{counts.active}</div>
                <div className="text-right tnum font-mono text-sm text-[var(--color-up)]">
                  {counts.passed}
                </div>
                <div className="text-right tnum font-mono text-sm text-[var(--color-down)]">
                  {counts.failed}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent signups */}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Recent signups</h2>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>User</div>
              <div>Email</div>
              <div>Plan</div>
              <div>Roles</div>
              <div className="text-right">Joined</div>
            </div>
            {((recent ?? []) as Array<{
              id: string;
              email: string | null;
              display_name: string | null;
              plan: string | null;
              created_at: string;
              roles: string[] | null;
              trial_until: string | null;
            }>).map((u) => {
              const plan = (u.plan ?? "free") as Plan;
              const trialActive =
                u.trial_until && new Date(u.trial_until).getTime() > Date.now();
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-[1.5fr_2fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 items-center text-sm"
                >
                  <div className="font-mono">
                    {u.display_name ?? u.email?.split("@")[0] ?? "—"}
                  </div>
                  <div className="text-[var(--color-text-dim)] truncate">{u.email}</div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                      style={
                        plan === "free"
                          ? {
                              color: "var(--color-text-faint)",
                              background: "rgba(139, 149, 167, 0.1)",
                            }
                          : plan === "pro"
                          ? {
                              color: "var(--color-phase1)",
                              background: "rgba(59, 130, 246, 0.12)",
                            }
                          : plan === "vip"
                          ? {
                              color: "var(--color-pro)",
                              background: "rgba(245, 158, 11, 0.12)",
                            }
                          : {
                              color: "var(--color-elite)",
                              background: "rgba(236, 72, 153, 0.12)",
                            }
                      }
                    >
                      {PLANS[plan].name}
                    </span>
                    {trialActive && (
                      <span className="text-[9px] uppercase text-[var(--color-text-faint)]">
                        trial
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(u.roles ?? []).map((r) => {
                      const cfg = ROLES[r as Role];
                      if (!cfg) return null;
                      return (
                        <span
                          key={r}
                          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            color: cfg.color,
                            background: `rgba(${cfg.colorRgb}, 0.12)`,
                          }}
                        >
                          {cfg.label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-right text-xs text-[var(--color-text-faint)]">
                    {format(new Date(u.created_at), "MMM d")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="text-[11px] text-[var(--color-text-faint)]">
        <Link href="/leaderboard" className="hover:text-[var(--color-text)] underline">
          See public leaderboard →
        </Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--color-surface)] p-5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className="text-2xl font-mono tnum">{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-faint)]">{sub}</div>}
    </div>
  );
}
