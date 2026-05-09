"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  Brain, Sparkles, PlayCircle, PauseCircle, Archive, TrendingUp,
  Beaker, Zap, Library, Lightbulb, Search, Activity, CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Strategy = {
  id: string; name: string; hypothesis: string | null; instruments: string[];
  source: "discovery" | "generation" | "manual";
  status: "proposed" | "backtested" | "live" | "paused";
  rules: Record<string, unknown>;
  backtest: BacktestResult | null;
  live_stats: Record<string, unknown> | null;
  created_at: string; last_signal_at: string | null; last_backtest_at: string | null;
};
type BacktestResult = {
  sampleSize: number; wins: number; losses: number; winRate: number;
  avgWinPct: number; avgLossPct: number; totalReturnPct: number; expectancyPct: number;
  profitFactor: number; maxDrawdownPct: number; avgRR: number;
  periodStart: string; periodEnd: string;
};
type Decision = { id: string; decision_type: string; rationale: string; created_at: string; strategy_id: string | null };

const TABS = [
  { id: "library", label: "Strategy library", Icon: Library },
  { id: "generate", label: "Generate ideas", Icon: Lightbulb },
  { id: "discover", label: "Discover from my trades", Icon: Search },
  { id: "log", label: "Decision log", Icon: Activity },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AILabClient({ strategies, decisions }: { strategies: Strategy[]; decisions: Decision[] }) {
  const [tab, setTab] = useState<TabId>(strategies.length > 0 ? "library" : "generate");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const generate = () => {
    setError(null); setInfo(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/ai-lab/generate", { method: "POST" });
        const data = await r.json();
        if (!r.ok) { setError(data.error ?? "Failed"); return; }
        setInfo(`Generated ${data.strategies?.length ?? 0} new hypotheses.`);
        router.refresh();
        setTab("library");
      } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    });
  };
  const discover = () => {
    setError(null); setInfo(null);
    startTransition(async () => {
      try {
        const r = await fetch("/api/ai-lab/discover", { method: "POST" });
        const data = await r.json();
        if (!r.ok) { setError(data.error ?? "Failed"); return; }
        if (data.message) setInfo(data.message);
        if (data.strategies?.length > 0) {
          setInfo(`Found ${data.strategies.length} patterns from your trades.`);
          router.refresh(); setTab("library");
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    });
  };
  const runBacktest = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true })); setError(null);
    try {
      const r = await fetch("/api/ai-lab/backtest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategyId: id }) });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? "Backtest failed");
      else router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy((b) => ({ ...b, [id]: false })); }
  };
  const setStatus = async (id: string, status: "live" | "paused" | "archived") => {
    setBusy((b) => ({ ...b, [id]: true })); setError(null);
    try {
      const r = await fetch("/api/ai-lab/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategyId: id, status }) });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Failed"); }
      else router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy((b) => ({ ...b, [id]: false })); }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)] flex items-center gap-1.5">
          <Brain className="w-3 h-3" />AI Strategy Lab
        </div>
        <h1 className="font-serif text-5xl mt-1">Find your edge.</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          The AI generates hypotheses, backtests them on real candles, and trades the winners on your paper account.
          Every move is logged with rationale — when it works, you see why. When it doesn&apos;t, you see the lesson.
        </p>
      </div>

      {(error || info) && (
        <div className={cn("text-sm border rounded-md px-3 py-2", error ? "text-[var(--color-down)] bg-[var(--color-down)]/10 border-[var(--color-down)]/30" : "text-[var(--color-up)] bg-[var(--color-up)]/10 border-[var(--color-up)]/30")}>
          {error ?? info}
        </div>
      )}

      <div className="border-b border-[var(--color-border)] flex gap-1 flex-wrap">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={cn("px-3 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px transition-colors", tab === id ? "border-[var(--color-up)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)]")}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === "generate" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-[var(--color-pro)] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif text-2xl">Generate fresh hypotheses</h2>
              <p className="text-sm text-[var(--color-text-dim)] mt-1 max-w-prose">
                AI reads today&apos;s news + market state (SPY, QQQ, VIX) and proposes 5 testable strategy ideas with explicit entry/exit rules.
              </p>
            </div>
          </div>
          <button onClick={generate} disabled={pending} className="btn-pulse inline-flex items-center gap-2 h-11 px-5 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium disabled:opacity-50">
            <Sparkles className="w-4 h-4" />{pending ? "Generating…" : "Generate 5 hypotheses"}
          </button>
        </div>
      )}

      {tab === "discover" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Search className="w-5 h-5 text-[var(--color-cyan)] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif text-2xl">Find patterns in your trades</h2>
              <p className="text-sm text-[var(--color-text-dim)] mt-1 max-w-prose">
                AI reads your last 50 trades and codifies repeating winning patterns into testable strategies. Need 10+ closed trades.
              </p>
            </div>
          </div>
          <button onClick={discover} disabled={pending} className="btn-pulse inline-flex items-center gap-2 h-11 px-5 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium disabled:opacity-50">
            <Beaker className="w-4 h-4" />{pending ? "Analyzing…" : "Extract my patterns"}
          </button>
        </div>
      )}

      {tab === "library" && (
        <div className="space-y-4">
          {strategies.length === 0 ? (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center space-y-3">
              <Brain className="w-8 h-8 text-[var(--color-text-faint)] mx-auto" />
              <div className="font-serif text-2xl">No strategies yet</div>
              <p className="text-sm text-[var(--color-text-dim)] max-w-prose mx-auto">
                Click <b>Generate ideas</b> for fresh hypotheses, or <b>Discover from my trades</b> if you&apos;ve placed 10+ trades.
              </p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              {strategies.map((s) => (
                <StrategyCard key={s.id} strategy={s} busy={busy[s.id] ?? false} onBacktest={() => runBacktest(s.id)} onLive={() => setStatus(s.id, "live")} onPause={() => setStatus(s.id, "paused")} onArchive={() => setStatus(s.id, "archived")} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "log" && (
        decisions.length === 0 ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center text-sm text-[var(--color-text-dim)]">
            No AI activity yet. Generate or discover strategies to start the log.
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
            {decisions.map((d) => <DecisionRow key={d.id} decision={d} />)}
          </div>
        )
      )}
    </div>
  );
}

function StrategyCard({ strategy: s, busy, onBacktest, onLive, onPause, onArchive }: { strategy: Strategy; busy: boolean; onBacktest: () => void; onLive: () => void; onPause: () => void; onArchive: () => void }) {
  const bt = s.backtest;
  const hasEdge = bt && bt.sampleSize >= 10 && bt.expectancyPct > 0 && bt.profitFactor > 1.2;
  const verdictColor = bt ? (hasEdge ? "var(--color-up)" : bt.expectancyPct > 0 ? "var(--color-cyan)" : "var(--color-down)") : "var(--color-text-faint)";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-serif text-xl truncate">{s.name}</h3>
          <SourceBadge source={s.source} />
          <StatusBadge status={s.status} />
        </div>
        {s.hypothesis && <p className="text-xs text-[var(--color-text-dim)] leading-relaxed">{s.hypothesis}</p>}
        <div className="flex flex-wrap gap-1 mt-1">
          {s.instruments.map((t) => <span key={t} className="text-[10px] font-mono text-[var(--color-text-dim)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded">{t}</span>)}
        </div>
      </div>
      {bt ? (
        <div className="bg-[var(--color-bg)] rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span className="text-[var(--color-text-faint)]">Backtest</span>
            <span style={{ color: verdictColor }}>{hasEdge ? "Edge found" : bt.expectancyPct > 0 ? "Weak edge" : "No edge"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Metric label="Trades" value={String(bt.sampleSize)} />
            <Metric label="Win rate" value={bt.sampleSize > 0 ? `${(bt.winRate * 100).toFixed(0)}%` : "—"} />
            <Metric label="R/R" value={bt.avgRR > 0 ? bt.avgRR.toFixed(2) : "—"} />
            <Metric label="Expectancy" value={bt.sampleSize > 0 ? `${bt.expectancyPct >= 0 ? "+" : ""}${bt.expectancyPct.toFixed(2)}%` : "—"} valueClass={bt.expectancyPct > 0 ? "text-[var(--color-up)]" : bt.expectancyPct < 0 ? "text-[var(--color-down)]" : ""} />
            <Metric label="Profit factor" value={bt.profitFactor === Infinity ? "∞" : bt.profitFactor > 0 ? bt.profitFactor.toFixed(2) : "—"} />
            <Metric label="Max DD" value={`${bt.maxDrawdownPct.toFixed(1)}%`} />
          </div>
        </div>
      ) : (
        <div className="bg-[var(--color-bg)] rounded-md p-3 text-xs text-[var(--color-text-faint)] text-center">Not yet backtested</div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={onBacktest} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-xs disabled:opacity-50">
          <Beaker className="w-3 h-3" />{bt ? "Re-run" : "Backtest"}
        </button>
        {s.status !== "live" && bt && bt.sampleSize > 0 && (
          <button onClick={onLive} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-[var(--color-up)] text-black text-xs font-medium disabled:opacity-50">
            <Zap className="w-3 h-3" />Go live
          </button>
        )}
        {s.status === "live" && (
          <button onClick={onPause} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-[var(--color-pro)] text-black text-xs font-medium disabled:opacity-50">
            <PauseCircle className="w-3 h-3" />Pause
          </button>
        )}
        <button onClick={onArchive} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[var(--color-text-faint)] hover:text-[var(--color-down)] text-xs disabled:opacity-50 ml-auto">
          <Archive className="w-3 h-3" />Archive
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
      <div className={cn("font-mono tnum text-sm", valueClass)}>{value}</div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const cfg = source === "discovery" ? { color: "var(--color-cyan)", rgb: "79, 220, 224", label: "Discovered" } : source === "generation" ? { color: "var(--color-pro)", rgb: "245, 158, 11", label: "Generated" } : { color: "var(--color-text-dim)", rgb: "168, 171, 182", label: "Manual" };
  return <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: cfg.color, background: `rgba(${cfg.rgb}, 0.12)` }}>{cfg.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = status === "live" ? { color: "var(--color-up)", rgb: "0, 227, 148", label: "Live", Icon: PlayCircle } : status === "backtested" ? { color: "var(--color-cyan)", rgb: "79, 220, 224", label: "Tested", Icon: CheckCircle2 } : status === "paused" ? { color: "var(--color-pro)", rgb: "245, 158, 11", label: "Paused", Icon: PauseCircle } : { color: "var(--color-text-dim)", rgb: "168, 171, 182", label: "Proposed", Icon: Lightbulb };
  const Icon = cfg.Icon;
  return <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium" style={{ color: cfg.color, background: `rgba(${cfg.rgb}, 0.12)` }}><Icon className="w-2.5 h-2.5" />{cfg.label}</span>;
}

function DecisionRow({ decision: d }: { decision: Decision }) {
  const Icon = d.decision_type === "trade_filled" ? TrendingUp : d.decision_type === "signal_fired" ? Zap : d.decision_type === "backtest_run" ? Beaker : d.decision_type === "hypothesis_generated" ? Lightbulb : d.decision_type === "discovery_run" ? Search : d.decision_type === "strategy_promoted" ? PlayCircle : d.decision_type === "strategy_paused" ? PauseCircle : d.decision_type === "strategy_archived" ? Archive : Brain;
  return (
    <div className="px-5 py-3.5 flex items-start gap-3">
      <Icon className="w-4 h-4 text-[var(--color-text-dim)] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug text-[var(--color-text-dim)]">{d.rationale}</div>
        <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider mt-1">
          {d.decision_type.replace(/_/g, " ")} · {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}
