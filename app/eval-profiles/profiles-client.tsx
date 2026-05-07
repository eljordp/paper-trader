"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FirmProfileConfig } from "@/lib/firmProfiles";
import { createFirmProfileAccount } from "@/lib/actions";
import { Plus } from "lucide-react";
import { usePortfolio } from "@/components/PortfolioProvider";
import Link from "next/link";

export default function EvalProfilesClient({ profile }: { profile: FirmProfileConfig }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const snapshot = usePortfolio();
  const userPlan = snapshot?.profile.plan ?? "free";
  const isFreeUser = userPlan === "free" && !snapshot?.profile.trial_until;

  const create = () => {
    setError(null);
    startTransition(async () => {
      try {
        await createFirmProfileAccount(profile.id);
        router.push("/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const dollar = (n: number | null) =>
    n != null
      ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : "—";

  return (
    <div
      className="relative bg-[var(--color-surface)] rounded-lg p-5 space-y-4 transition-all hover:-translate-y-1"
      style={{
        border: `1px solid rgba(${profile.colorRgb}, 0.4)`,
        boxShadow: `0 0 30px -16px rgba(${profile.colorRgb}, 0.5)`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(${profile.colorRgb}, 0.8), transparent)`,
        }}
      />
      <div className="space-y-1">
        <div
          className="text-[10px] uppercase tracking-wider font-medium"
          style={{ color: profile.color }}
        >
          {profile.firmDisplay} · {profile.evalName}
        </div>
        <div className="font-mono tnum text-3xl mt-1">
          {dollar(profile.startingCash)}
        </div>
        <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">
          {profile.description}
        </p>
      </div>

      <div className="hairline pt-3 space-y-1.5 text-xs">
        <RuleRow label="Profit target" value={dollar(profile.profitTargetDollars)} />
        <RuleRow
          label="Daily loss limit"
          value={profile.dailyLossLimitDollars ? dollar(profile.dailyLossLimitDollars) : "None"}
        />
        <RuleRow
          label="Max drawdown"
          value={`${dollar(profile.maxDrawdownDollars)} (${profile.drawdownType})`}
        />
        <RuleRow label="Min trading days" value={profile.minTradingDays.toString()} />
        {profile.consistencyRulePct != null && (
          <RuleRow
            label="Consistency rule"
            value={`${profile.consistencyRulePct}% max single day`}
          />
        )}
        {profile.noOvernight && <RuleRow label="Overnight" value="Not allowed" />}
      </div>

      {isFreeUser ? (
        <Link
          href="/pro"
          className="block w-full h-10 rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 text-black"
          style={{
            background: `linear-gradient(135deg, var(--color-pro), var(--color-elite))`,
          }}
        >
          Upgrade to Pro to start
        </Link>
      ) : (
        <button
          onClick={create}
          disabled={pending}
          className="btn-pulse w-full h-10 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5 text-black"
          style={{ backgroundColor: profile.color }}
        >
          <Plus className="w-3.5 h-3.5" />
          {pending ? "Creating…" : `Start ${profile.firmDisplay} ${profile.evalName}`}
        </button>
      )}
      {error && (
        <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-faint)] uppercase tracking-wider">{label}</span>
      <span className="font-mono tnum text-[var(--color-text)]">{value}</span>
    </div>
  );
}
