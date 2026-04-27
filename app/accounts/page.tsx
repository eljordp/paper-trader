"use client";

import { usePortfolio } from "@/components/PortfolioProvider";
import { TIERS, TIER_ORDER, type Tier } from "@/lib/tiers";
import { createTierAccount, switchAccount } from "@/lib/actions";
import { useTransition, useState } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Lock, Trophy, AlertTriangle, Plus, Check, Sparkles } from "lucide-react";
import Link from "next/link";

export default function AccountsPage() {
  const snapshot = usePortfolio();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const highestUnlocked = snapshot.profile.highest_tier_unlocked as Tier;
  const activeId = snapshot.activeAccount?.id;
  const isPro = snapshot.profile.is_pro;

  const handleCreate = (tier: Tier) => {
    setError(null);
    startTransition(async () => {
      try {
        await createTierAccount(tier);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create account");
      }
    });
  };

  const handleSwitch = (id: string) => {
    startTransition(async () => {
      await switchAccount(id);
    });
  };

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-12">
      {/* Tier ladder */}
      <section className="space-y-6">
        <div>
          <h1 className="font-serif text-5xl">Accounts</h1>
          <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
            Pass each tier to unlock the next. Same rules real funded firms use.
          </p>
        </div>

        {error && (
          <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TIER_ORDER.map((tier) => {
            const cfg = TIERS[tier];
            const unlocked = TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(highestUnlocked);
            const requiresPro = tier !== "rookie";
            const proLocked = requiresPro && !isPro;
            const existingAccount = snapshot.accounts.find((a) => a.tier === tier);
            return (
              <div
                key={tier}
                className={cn(
                  "bg-[var(--color-surface)] border rounded-lg p-5 space-y-4",
                  unlocked ? "border-[var(--color-border)]" : "border-[var(--color-border)] opacity-50"
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-serif text-2xl">{cfg.name}</div>
                    <div className="font-mono tnum text-3xl mt-1">
                      ${(cfg.startingCash / 1000).toFixed(0)}K
                    </div>
                  </div>
                  {!unlocked && <Lock className="w-4 h-4 text-[var(--color-text-faint)]" />}
                </div>

                <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">{cfg.description}</p>

                <div className="hairline pt-3 space-y-1.5 text-xs">
                  <RuleRow label="Profit target" value={cfg.rules.profitTargetPct ? `+${cfg.rules.profitTargetPct}%` : "None"} />
                  <RuleRow label="Daily loss limit" value={cfg.rules.dailyLossLimitPct ? `-${cfg.rules.dailyLossLimitPct}%` : "None"} />
                  <RuleRow label="Max drawdown" value={cfg.rules.maxDrawdownPct ? `-${cfg.rules.maxDrawdownPct}%` : "None"} />
                  <RuleRow label="Min trading days" value={cfg.rules.minTradingDays?.toString() ?? "None"} />
                </div>

                {unlocked && !existingAccount && !proLocked && (
                  <button
                    onClick={() => handleCreate(tier)}
                    disabled={pending}
                    className="w-full h-9 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Start {cfg.name}
                  </button>
                )}

                {unlocked && proLocked && !existingAccount && (
                  <Link
                    href="/pro"
                    className="w-full h-9 rounded-md bg-[var(--color-up)] text-black text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Upgrade to unlock
                  </Link>
                )}

                {!unlocked && cfg.unlockedBy && (
                  <div className="text-[11px] text-[var(--color-text-faint)] uppercase tracking-wider text-center pt-1">
                    Unlock by passing {TIERS[cfg.unlockedBy].name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Existing accounts */}
      {snapshot.accounts.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-serif text-3xl">Your accounts</h2>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>Tier</div>
              <div>Status</div>
              <div className="text-right">Starting</div>
              <div className="text-right">Cash</div>
              <div className="text-right">Created</div>
              <div></div>
            </div>
            {snapshot.accounts.map((a) => {
              const isActive = a.id === activeId;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 border-b border-[var(--color-border)] last:border-b-0 items-center",
                    isActive && "bg-[var(--color-surface-2)]"
                  )}
                >
                  <div className="font-medium">{TIERS[a.tier as Tier].name}</div>
                  <div>
                    {a.status === "active" && (
                      <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">active</span>
                    )}
                    {a.status === "passed" && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-up)]/15 text-[var(--color-up)]">
                        <Trophy className="w-3 h-3" /> passed
                      </span>
                    )}
                    {a.status === "failed" && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-down)]/15 text-[var(--color-down)]">
                        <AlertTriangle className="w-3 h-3" /> failed
                      </span>
                    )}
                  </div>
                  <div className="text-right font-mono tnum text-sm text-[var(--color-text-dim)]">{money(Number(a.starting_cash), { cents: false })}</div>
                  <div className="text-right font-mono tnum text-sm">{money(Number(a.cash), { cents: false })}</div>
                  <div className="text-right text-xs text-[var(--color-text-faint)]">{new Date(a.created_at).toLocaleDateString()}</div>
                  <div className="flex justify-end">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-up)]">
                        <Check className="w-3 h-3" /> active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSwitch(a.id)}
                        disabled={pending}
                        className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text)] disabled:opacity-50"
                      >
                        Switch
                      </button>
                    )}
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

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-faint)] uppercase tracking-wider">{label}</span>
      <span className="font-mono tnum">{value}</span>
    </div>
  );
}
