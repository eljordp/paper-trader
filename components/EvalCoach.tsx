"use client";

import { useEffect, useState } from "react";
import type { EvalCoachOutput } from "@/lib/brain";
import { Brain, AlertOctagon, AlertTriangle, CheckCircle2, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Cache = { result: EvalCoachOutput; ts: number };
const CACHE_KEY_PREFIX = "paper-trader.coach.v1.";
const CACHE_TTL_MS = 15 * 60 * 1000;

export default function EvalCoach({ accountId }: { accountId: string }) {
  const [data, setData] = useState<EvalCoachOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = CACHE_KEY_PREFIX + accountId;

    // Try cache first
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(cacheKey);
      if (raw) {
        try {
          const cached = JSON.parse(raw) as Cache;
          if (Date.now() - cached.ts < CACHE_TTL_MS) {
            setData(cached.result);
            setLoading(false);
            return;
          }
        } catch {}
      }
    }

    const run = async () => {
      try {
        const r = await fetch("/api/brain/eval-coach", { method: "POST" });
        if (!r.ok) {
          setError("Brain unavailable");
          setLoading(false);
          return;
        }
        const result = (await r.json()) as EvalCoachOutput | { error: string };
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
          setLoading(false);
          return;
        }
        setData(result);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({ result, ts: Date.now() } as Cache)
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (error || (!loading && !data)) return null;

  if (loading) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex items-center gap-3">
        <Brain className="w-5 h-5 text-[var(--color-text-faint)] animate-pulse" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            Eval coach
          </div>
          <div className="text-sm text-[var(--color-text-dim)]">Analyzing your trajectory…</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tone =
    data.verdict === "passed"
      ? { color: "var(--color-up)", rgb: "0, 227, 148", label: "Passed" }
      : data.verdict === "failed"
      ? { color: "var(--color-down)", rgb: "255, 77, 110", label: "Failed" }
      : data.verdict === "on_track"
      ? { color: "var(--color-up)", rgb: "0, 227, 148", label: "On track" }
      : data.verdict === "at_risk"
      ? { color: "var(--color-pro)", rgb: "245, 158, 11", label: "At risk" }
      : { color: "var(--color-down)", rgb: "255, 77, 110", label: "In trouble" };

  const Icon =
    data.verdict === "passed"
      ? Trophy
      : data.verdict === "failed"
      ? XCircle
      : data.verdict === "on_track"
      ? CheckCircle2
      : data.verdict === "at_risk"
      ? AlertTriangle
      : AlertOctagon;

  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{
        background: `linear-gradient(135deg, rgba(${tone.rgb}, 0.06), transparent 70%)`,
        border: `1px solid rgba(${tone.rgb}, 0.3)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Brain className="w-4 h-4 text-[var(--color-text-dim)]" />
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            Eval coach
          </span>
        </div>
        <div className="flex-1" />
        <div
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded"
          style={{
            color: tone.color,
            background: `rgba(${tone.rgb}, 0.12)`,
          }}
        >
          <Icon className="w-3 h-3" />
          {tone.label}
        </div>
      </div>

      {/* Probability dial */}
      <div className="flex items-center gap-5">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="var(--color-bg)"
              strokeWidth="6"
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={tone.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(data.passProbability / 100) * (2 * Math.PI * 34)} ${
                2 * Math.PI * 34
              }`}
              style={{
                transition: "stroke-dasharray 1s ease-out",
                filter: `drop-shadow(0 0 6px rgba(${tone.rgb}, 0.4))`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono tnum text-2xl font-bold" style={{ color: tone.color }}>
              {data.passProbability}
            </div>
            <div className="text-[8px] uppercase tracking-wider text-[var(--color-text-faint)]">
              % pass
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base leading-snug">{data.headline}</div>
        </div>
      </div>

      {/* Must do + risks */}
      {(data.mustDo.length > 0 || data.biggestRisks.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 hairline pt-4">
          {data.mustDo.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                What to do
              </div>
              <ul className="space-y-1.5">
                {data.mustDo.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <CheckCircle2 className="w-3 h-3 text-[var(--color-up)] shrink-0 mt-0.5" />
                    <span className="text-[var(--color-text-dim)] leading-relaxed">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.biggestRisks.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                Watch out for
              </div>
              <ul className="space-y-1.5">
                {data.biggestRisks.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <AlertTriangle
                      className={cn(
                        "w-3 h-3 shrink-0 mt-0.5",
                        data.verdict === "in_trouble"
                          ? "text-[var(--color-down)]"
                          : "text-[var(--color-pro)]"
                      )}
                    />
                    <span className="text-[var(--color-text-dim)] leading-relaxed">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
