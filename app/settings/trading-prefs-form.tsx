"use client";

import { useState, useTransition } from "react";
import { updateTradingPreferences } from "@/lib/settings-actions";

export default function TradingPrefsForm({
  initialCooldown,
  initialRiskPct,
}: {
  initialCooldown: number | null;
  initialRiskPct: number | null;
}) {
  const [cooldown, setCooldown] = useState<string>(
    initialCooldown != null ? String(initialCooldown) : "15",
  );
  const [riskPct, setRiskPct] = useState<string>(
    initialRiskPct != null ? String(initialRiskPct) : "1",
  );
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const onSave = () => {
    setStatus(null);
    startTransition(async () => {
      try {
        await updateTradingPreferences({
          cooldownMinutes: cooldown === "" ? null : Number(cooldown),
          defaultRiskPct: riskPct === "" ? null : Number(riskPct),
        });
        setStatus("Saved");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium">Cooldown after stop loss</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="120"
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            className="w-20 px-3 h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
          />
          <span className="text-sm text-[var(--color-text-dim)]">minutes</span>
        </div>
        <div className="text-[11px] text-[var(--color-text-faint)]">
          Block new trades for this long after a stop-loss exit. Defaults to 15. Set to 0 to disable.
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Default position risk</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            className="w-20 px-3 h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
          />
          <span className="text-sm text-[var(--color-text-dim)]">% of account per trade</span>
        </div>
        <div className="text-[11px] text-[var(--color-text-faint)]">
          Default % of account equity to risk per trade. Used by the trade ticket&apos;s sizing helper.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="px-4 h-10 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        {status && (
          <span className="text-xs text-[var(--color-text-dim)]">{status}</span>
        )}
      </div>
    </div>
  );
}
