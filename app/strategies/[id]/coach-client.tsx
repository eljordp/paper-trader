"use client";

import { useState } from "react";
import type { StrategyCoachOutput } from "@/lib/brain";
import { Brain, CheckCircle2, AlertTriangle, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export default function StrategyCoachClient({
  strategyId,
  hasTrades,
}: {
  strategyId: string;
  hasTrades: boolean;
}) {
  const [data, setData] = useState<StrategyCoachOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/brain/strategy-coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strategyId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setError(err.error ?? "Brain unavailable");
        return;
      }
      const result = (await r.json()) as StrategyCoachOutput;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-center space-y-3">
        <Brain className="w-8 h-8 text-[var(--color-text-faint)] mx-auto" />
        <div className="font-serif text-xl">
          {hasTrades
            ? "Run the brain on this strategy"
            : "Tag a few trades first"}
        </div>
        <p className="text-sm text-[var(--color-text-dim)] max-w-prose mx-auto">
          {hasTrades
            ? "The brain reads your defined rules and recent trades to identify what's working, what's drifting, and the single next move."
            : "Coaching is most useful after 5+ tagged trades. Open a trade ticket and pick this strategy from the dropdown."}
        </p>
        <button
          onClick={run}
          disabled={loading || !hasTrades}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? "Analyzing…" : <><Sparkles className="w-3.5 h-3.5" /> Run brain coach</>}
        </button>
        {error && (
          <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2 inline-block">
            {error}
          </div>
        )}
      </div>
    );
  }

  const tone =
    data.verdict === "edge_confirmed"
      ? { color: "var(--color-up)", rgb: "0, 227, 148", label: "Edge confirmed" }
      : data.verdict === "promising"
      ? { color: "var(--color-cyan)", rgb: "79, 220, 224", label: "Promising" }
      : data.verdict === "drift"
      ? { color: "var(--color-pro)", rgb: "245, 158, 11", label: "Drifting" }
      : data.verdict === "broken"
      ? { color: "var(--color-down)", rgb: "255, 77, 110", label: "No edge" }
      : { color: "var(--color-text-dim)", rgb: "168, 171, 182", label: "Too early" };

  return (
    <div
      className="rounded-lg p-5 space-y-5"
      style={{
        background: `linear-gradient(135deg, rgba(${tone.rgb}, 0.06), transparent 70%)`,
        border: `1px solid rgba(${tone.rgb}, 0.3)`,
      }}
    >
      <div className="flex items-center gap-3">
        <Brain className="w-4 h-4 text-[var(--color-text-dim)]" />
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          Brain coach
        </span>
        <div className="flex-1" />
        <span
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded font-medium"
          style={{
            color: tone.color,
            background: `rgba(${tone.rgb}, 0.12)`,
          }}
        >
          {tone.label}
        </span>
        <button
          onClick={run}
          disabled={loading}
          className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <div className="font-serif text-2xl leading-snug" style={{ color: tone.color }}>
        {data.headline}
      </div>

      <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
        {data.whatWorks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              What works
            </div>
            <ul className="space-y-1.5">
              {data.whatWorks.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-up)] shrink-0 mt-[3px]" />
                  <span className="text-[var(--color-text-dim)] leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.whatToFix.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              What to fix
            </div>
            <ul className="space-y-1.5">
              {data.whatToFix.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-pro)] shrink-0 mt-[3px]" />
                  <span className="text-[var(--color-text-dim)] leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="hairline pt-4 flex items-start gap-2">
        <Target className="w-4 h-4 text-[var(--color-text-dim)] shrink-0 mt-0.5" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            Next step
          </div>
          <div className="text-sm mt-0.5">{data.nextStep}</div>
        </div>
      </div>
    </div>
  );
}
