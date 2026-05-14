import Link from "next/link";
import { adminClient } from "@/lib/admin";
import { AI_PROFILES } from "@/lib/aiTrader";
import { computeEquityForAccounts } from "@/lib/equity";

// Roster strip shown at the top of every AI's public page so visitors can
// jump between the four traders and instantly see who's winning. Each card
// shows the AI's name, one-line style description, and current return %.
export default async function AiNav({ currentSlug }: { currentSlug: string }) {
  const sb = adminClient();
  const { data: profileRows } = await sb
    .from("profiles")
    .select("id, slug, active_account_id")
    .in(
      "slug",
      AI_PROFILES.map((p) => p.slug),
    );
  const profileBySlug = new Map<string, { id: string; active_account_id: string | null }>();
  for (const r of (profileRows ?? []) as Array<{
    id: string;
    slug: string;
    active_account_id: string | null;
  }>) {
    profileBySlug.set(r.slug, { id: r.id, active_account_id: r.active_account_id });
  }

  const accountIds = Array.from(profileBySlug.values())
    .map((p) => p.active_account_id)
    .filter((id): id is string => !!id);

  const accountBySlug = new Map<
    string,
    { cash: number; starting_cash: number; equity: number; accountId: string }
  >();
  const resetsBySlug = new Map<string, number>();
  const liveBySlug = new Map<string, Array<{ name: string; instruments: string[] }>>();
  if (accountIds.length > 0) {
    const profileIds = Array.from(profileBySlug.values()).map((p) => p.id);
    const [acctRes, resetRes, stratRes] = await Promise.all([
      sb
        .from("accounts")
        .select("id, cash, starting_cash, user_id")
        .in("id", accountIds),
      sb
        .from("ai_decisions")
        .select("user_id")
        .in("user_id", profileIds)
        .eq("decision_type", "account_reset"),
      sb
        .from("ai_strategies")
        .select("user_id, name, instruments, created_at")
        .in("user_id", profileIds)
        .eq("status", "live")
        .order("created_at", { ascending: false }),
    ]);
    const accounts = (acctRes.data ?? []) as Array<{
      id: string;
      cash: number;
      starting_cash: number;
      user_id: string;
    }>;
    const resets = (resetRes.data ?? []) as Array<{ user_id: string }>;
    const strategies = (stratRes.data ?? []) as Array<{
      user_id: string;
      name: string;
      instruments: string[];
    }>;
    // Marked-to-market equity for every bootstrapped AI in one batched pass
    const equityById = await computeEquityForAccounts(sb, accountIds);

    for (const cfg of AI_PROFILES) {
      const profile = profileBySlug.get(cfg.slug);
      if (!profile) continue;
      const acct = accounts.find((a) => a.id === profile.active_account_id);
      if (!acct) continue;
      const eb = equityById[acct.id];
      accountBySlug.set(cfg.slug, {
        cash: Number(acct.cash),
        starting_cash: Number(acct.starting_cash),
        equity: eb?.equity ?? Number(acct.cash),
        accountId: acct.id,
      });
      const resetCount = resets.filter((r) => r.user_id === profile.id).length;
      if (resetCount > 0) resetsBySlug.set(cfg.slug, resetCount);
      const live = strategies
        .filter((s) => s.user_id === profile.id)
        .slice(0, 3);
      if (live.length > 0) liveBySlug.set(cfg.slug, live);
    }
  }

  return (
    <nav className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
        AI Trader Leaderboard
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {AI_PROFILES.map((cfg) => {
          const acct = accountBySlug.get(cfg.slug);
          const ret =
            acct && acct.starting_cash > 0
              ? ((acct.equity - acct.starting_cash) / acct.starting_cash) * 100
              : null;
          const isCurrent = cfg.slug === currentSlug;
          const isBootstrapped = profileBySlug.has(cfg.slug);
          return (
            <Link
              key={cfg.slug}
              href={`/u/${cfg.slug}`}
              aria-current={isCurrent ? "page" : undefined}
              className={`block rounded-lg border p-3 transition-colors ${
                isCurrent
                  ? "bg-[var(--color-cyan)]/5 border-[var(--color-cyan)]/40"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-text-faint)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm">{cfg.displayName}</div>
                <div
                  className={`text-xs font-mono tnum ${
                    ret == null
                      ? "text-[var(--color-text-faint)]"
                      : ret > 0
                        ? "text-[var(--color-up)]"
                        : ret < 0
                          ? "text-[var(--color-down)]"
                          : "text-[var(--color-text-dim)]"
                  }`}
                >
                  {ret == null
                    ? "—"
                    : `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`}
                </div>
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)] leading-snug mt-1">
                {cfg.shortHeadline}
              </div>
              {liveBySlug.has(cfg.slug) && (
                <div className="text-[10px] text-[var(--color-up)] mt-1.5 leading-snug">
                  <span className="uppercase tracking-wider text-[9px] text-[var(--color-text-faint)] mr-1">
                    Live now
                  </span>
                  {liveBySlug.get(cfg.slug)!.map((s, i) => (
                    <span key={i}>
                      {i > 0 ? " · " : ""}
                      <span className="font-mono">{s.instruments.join("/")}</span>{" "}
                      <span className="text-[var(--color-text-dim)]">{s.name}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-[var(--color-text-faint)] mt-1 font-mono">
                ${(cfg.startingCash / 1000).toFixed(0)}K · {cfg.defaultRiskPct}% risk
                {resetsBySlug.has(cfg.slug)
                  ? ` · ${resetsBySlug.get(cfg.slug)} reset${resetsBySlug.get(cfg.slug) === 1 ? "" : "s"}`
                  : ""}
                {!isBootstrapped ? " · pending" : ""}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
