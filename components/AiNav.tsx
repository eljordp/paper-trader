import Link from "next/link";
import { adminClient } from "@/lib/admin";
import { AI_PROFILES } from "@/lib/aiTrader";

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

  const accountBySlug = new Map<string, { cash: number; starting_cash: number }>();
  if (accountIds.length > 0) {
    const { data: accountRows } = await sb
      .from("accounts")
      .select("id, cash, starting_cash, user_id")
      .in("id", accountIds);
    const accounts = (accountRows ?? []) as Array<{
      id: string;
      cash: number;
      starting_cash: number;
      user_id: string;
    }>;
    for (const cfg of AI_PROFILES) {
      const profile = profileBySlug.get(cfg.slug);
      if (!profile) continue;
      const acct = accounts.find((a) => a.id === profile.active_account_id);
      if (!acct) continue;
      accountBySlug.set(cfg.slug, {
        cash: Number(acct.cash),
        starting_cash: Number(acct.starting_cash),
      });
    }
  }

  return (
    <nav className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
        AI Trader Leaderboard
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {AI_PROFILES.map((cfg) => {
          const acct = accountBySlug.get(cfg.slug);
          const ret =
            acct && acct.starting_cash > 0
              ? ((acct.cash - acct.starting_cash) / acct.starting_cash) * 100
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
              <div className="text-[10px] text-[var(--color-text-faint)] mt-1 font-mono">
                ${(cfg.startingCash / 1000).toFixed(0)}K · {cfg.defaultRiskPct}% risk
                {!isBootstrapped ? " · pending" : ""}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
