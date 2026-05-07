"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStrategy, updateStrategy, deleteStrategy } from "@/lib/strategies";
import { Trash2 } from "lucide-react";

type StrategyDraft = {
  id?: string;
  name: string;
  description: string | null;
  entry_rules: string | null;
  exit_rules: string | null;
  size_rules: string | null;
  time_window: string | null;
  instruments: string[] | null;
};

export default function StrategyForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: StrategyDraft;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (mode === "create") {
          const created = await createStrategy(fd);
          router.push(`/strategies/${created.id}`);
        } else if (initial?.id) {
          await updateStrategy(initial.id, fd);
          router.push(`/strategies/${initial.id}`);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const onDelete = () => {
    if (!initial?.id) return;
    if (!confirm("Delete this strategy? Trade tags will be unassigned but trades stay.")) return;
    startTransition(async () => {
      try {
        await deleteStrategy(initial.id!);
        router.push("/strategies");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Field label="Name" required>
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={initial?.name ?? ""}
          placeholder="e.g. VWAP Reclaim Long"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
        />
      </Field>

      <Field
        label="Description"
        hint="One-line summary. What is this strategy looking for?"
      >
        <textarea
          name="description"
          rows={2}
          maxLength={300}
          defaultValue={initial?.description ?? ""}
          placeholder="Long bias on pullback to VWAP after morning gap up, looking for reclaim with volume confirmation."
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] resize-none"
        />
      </Field>

      <Field
        label="Entry rules"
        hint="Specific conditions to enter. Multi-line OK."
      >
        <textarea
          name="entry_rules"
          rows={4}
          maxLength={800}
          defaultValue={initial?.entry_rules ?? ""}
          placeholder={`- Stock gapped up >2% on volume\n- Price pulled back to VWAP\n- Bullish reversal candle on 1m close above VWAP\n- Volume on reclaim candle > 2x avg of last 5`}
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] resize-none font-mono"
        />
      </Field>

      <Field
        label="Exit rules"
        hint="Where stops go and how you take profit."
      >
        <textarea
          name="exit_rules"
          rows={4}
          maxLength={800}
          defaultValue={initial?.exit_rules ?? ""}
          placeholder={`- Stop: 2 cents below the reclaim candle low\n- Target 1: 1R (sell 50%)\n- Target 2: prior day high or 2R, trail rest with 5m EMA9`}
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] resize-none font-mono"
        />
      </Field>

      <Field
        label="Position sizing"
        hint="Account risk per trade for this setup."
      >
        <textarea
          name="size_rules"
          rows={2}
          maxLength={300}
          defaultValue={initial?.size_rules ?? ""}
          placeholder={`Risk 1% of account per trade. Max 3 concurrent positions in this setup.`}
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] resize-none"
        />
      </Field>

      <Field
        label="Time window"
        hint="When this strategy is active during the day."
      >
        <input
          name="time_window"
          maxLength={60}
          defaultValue={initial?.time_window ?? ""}
          placeholder="9:30–10:30 ET only"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
        />
      </Field>

      <Field
        label="Instruments"
        hint="Comma-separated tickers / categories this applies to."
      >
        <input
          name="instruments"
          defaultValue={(initial?.instruments ?? []).join(", ")}
          placeholder="SPY, QQQ, AAPL, NVDA, TSLA"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] font-mono uppercase"
        />
      </Field>

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
            ? "Create strategy"
            : "Save changes"}
        </button>
        {mode === "edit" && initial?.id && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-faint)] hover:text-[var(--color-down)] transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Delete strategy
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <label className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
          {label} {required && <span className="text-[var(--color-down)]">*</span>}
        </label>
        {hint && (
          <span className="text-[11px] text-[var(--color-text-faint)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
