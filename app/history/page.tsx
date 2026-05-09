"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePortfolio } from "@/components/PortfolioProvider";
import { money, pnlColor, shares as fmtShares } from "@/lib/format";
import { cn } from "@/lib/cn";
import { format } from "date-fns";
import {
  Pencil,
  Check,
  X,
  Shield,
  Target,
  Brain,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { updateTradeNote } from "@/lib/actions";

type Trade = {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  realized_pnl: number | null;
  notes: string | null;
  triggered_by: "manual" | "stop" | "target" | "eval_failed" | null;
  review:
    | {
        score: number;
        verdict: "textbook" | "good" | "decent" | "poor" | "bad";
        headline: string;
        whatRight: string[];
        whatWrong: string[];
        keyLesson: string;
      }
    | null;
  review_at: string | null;
  created_at: string;
};

export default function HistoryPage() {
  const snapshot = usePortfolio();
  if (!snapshot) return null;
  const trades = snapshot.trades as unknown as Trade[];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="font-serif text-5xl">Trade history</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          Click{" "}
          <span className="text-[var(--color-text)] font-medium">Review</span>{" "}
          on any closed trade — the brain reads the candles around your entry &amp; exit and grades your execution.
        </p>
      </div>

      {trades.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
          <div className="text-[var(--color-text-dim)] mb-1">No trades yet</div>
          <div className="text-xs text-[var(--color-text-faint)]">
            Search a ticker and place your first trade.
          </div>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.2fr_0.6fr_1fr_0.8fr_1fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>Date</div>
              <div>Side</div>
              <div>Ticker</div>
              <div className="text-right">Shares</div>
              <div className="text-right">Price</div>
              <div className="text-right">Total</div>
              <div className="text-right">Realized P&L</div>
              <div className="text-right pr-2">Review</div>
              <div className="text-right pr-2">Note</div>
            </div>
            {trades.map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trade.notes ?? "");
  const [, startTransition] = useTransition();
  const [review, setReview] = useState(trade.review);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const canReview = trade.side === "sell" && trade.realized_pnl != null;
  const hasReview = !!review;

  const save = () => {
    startTransition(async () => {
      await updateTradeNote(trade.id, draft);
      setEditing(false);
    });
  };

  const runReview = async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const r = await fetch("/api/brain/trade-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tradeId: trade.id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setReviewError(err.error ?? "Brain unavailable");
        return;
      }
      const result = await r.json();
      setReview(result);
      setReviewOpen(true);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Network error");
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      <div className="grid grid-cols-[1.2fr_0.6fr_1fr_0.8fr_1fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 text-sm items-center">
        <div className="text-[var(--color-text-dim)] text-xs">
          {format(new Date(trade.created_at), "MMM d, h:mm a")}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block text-[10px] uppercase font-medium tracking-wider px-1.5 py-0.5 rounded",
              trade.side === "buy"
                ? "bg-[var(--color-up)]/10 text-[var(--color-up)]"
                : "bg-[var(--color-down)]/10 text-[var(--color-down)]"
            )}
          >
            {trade.side}
          </span>
          {trade.triggered_by === "stop" && (
            <Shield className="w-3 h-3 text-[var(--color-down)]" />
          )}
          {trade.triggered_by === "target" && (
            <Target className="w-3 h-3 text-[var(--color-up)]" />
          )}
        </div>
        <Link href={`/trade/${trade.ticker}`} className="font-mono hover:underline">
          {trade.ticker}
        </Link>
        <div className="text-right tnum font-mono">{fmtShares(Number(trade.shares))}</div>
        <div className="text-right tnum font-mono">{money(Number(trade.price))}</div>
        <div className="text-right tnum font-mono">{money(Number(trade.total))}</div>
        <div
          className={cn(
            "text-right tnum font-mono",
            trade.realized_pnl != null
              ? pnlColor(Number(trade.realized_pnl))
              : "text-[var(--color-text-faint)]"
          )}
        >
          {trade.realized_pnl != null
            ? `${Number(trade.realized_pnl) >= 0 ? "+" : ""}${money(Number(trade.realized_pnl))}`
            : "—"}
        </div>
        <div className="flex justify-end pr-1">
          {canReview ? (
            hasReview ? (
              <button
                onClick={() => setReviewOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded font-medium",
                  reviewToneClasses(review!.verdict)
                )}
              >
                <Brain className="w-3 h-3" />
                {review!.score}/10
                {reviewOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : (
              <button
                onClick={runReview}
                disabled={reviewLoading}
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                title="Get a brain review of this trade"
              >
                {reviewLoading ? (
                  "…"
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" /> Review
                  </>
                )}
              </button>
            )
          ) : (
            <span className="text-[10px] text-[var(--color-text-faint)]">—</span>
          )}
        </div>
        <div className="flex justify-end pr-1">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] p-1"
              title={trade.notes ? "Edit note" : "Add note"}
            >
              {trade.notes ? (
                <span className="text-[10px] uppercase tracking-wider">Note</span>
              ) : (
                <Pencil className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={save} className="text-[var(--color-up)] hover:opacity-80 p-1" title="Save">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(trade.notes ?? "");
                }}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] p-1"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      {editing ? (
        <div className="px-5 pb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Why this trade? Setup, lessons learned…"
            rows={2}
            autoFocus
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2 text-xs placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] resize-none"
          />
        </div>
      ) : trade.notes ? (
        <div className="px-5 pb-3 -mt-1 text-xs text-[var(--color-text-dim)] italic max-w-2xl">
          {trade.notes}
        </div>
      ) : null}
      {reviewOpen && review && <ReviewPanel review={review} />}
      {reviewError && (
        <div className="mx-5 mb-3 text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {reviewError}
        </div>
      )}
    </div>
  );
}

function reviewToneClasses(verdict: "textbook" | "good" | "decent" | "poor" | "bad"): string {
  switch (verdict) {
    case "textbook":
      return "text-[var(--color-up)] bg-[var(--color-up)]/10 border border-[var(--color-up)]/30";
    case "good":
      return "text-[var(--color-cyan)] bg-[var(--color-cyan)]/10 border border-[var(--color-cyan)]/30";
    case "decent":
      return "text-[var(--color-text-dim)] bg-[var(--color-surface-2)] border border-[var(--color-border)]";
    case "poor":
      return "text-[var(--color-pro)] bg-[var(--color-pro)]/10 border border-[var(--color-pro)]/30";
    case "bad":
      return "text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30";
  }
}

function ReviewPanel({ review }: { review: NonNullable<Trade["review"]> }) {
  const tone =
    review.verdict === "textbook"
      ? { color: "var(--color-up)", rgb: "0, 227, 148" }
      : review.verdict === "good"
      ? { color: "var(--color-cyan)", rgb: "79, 220, 224" }
      : review.verdict === "decent"
      ? { color: "var(--color-text-dim)", rgb: "168, 171, 182" }
      : review.verdict === "poor"
      ? { color: "var(--color-pro)", rgb: "245, 158, 11" }
      : { color: "var(--color-down)", rgb: "255, 77, 110" };

  return (
    <div
      className="mx-5 mb-4 rounded-lg p-4 space-y-4"
      style={{
        background: `linear-gradient(135deg, rgba(${tone.rgb}, 0.06), transparent 70%)`,
        border: `1px solid rgba(${tone.rgb}, 0.3)`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-md flex items-center justify-center font-mono tnum text-xl font-bold shrink-0"
          style={{
            background: `rgba(${tone.rgb}, 0.18)`,
            color: tone.color,
            border: `1px solid rgba(${tone.rgb}, 0.4)`,
          }}
        >
          {review.score}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Brain className="w-3 h-3 text-[var(--color-text-faint)]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              Trade review · {review.verdict}
            </span>
          </div>
          <div className="text-base font-serif" style={{ color: tone.color }}>
            {review.headline}
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-3">
        {review.whatRight.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              What went right
            </div>
            <ul className="space-y-1">
              {review.whatRight.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <CheckCircle2 className="w-3 h-3 text-[var(--color-up)] shrink-0 mt-[2px]" />
                  <span className="text-[var(--color-text-dim)] leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {review.whatWrong.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              What went wrong
            </div>
            <ul className="space-y-1">
              {review.whatWrong.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <AlertTriangle className="w-3 h-3 text-[var(--color-down)] shrink-0 mt-[2px]" />
                  <span className="text-[var(--color-text-dim)] leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="hairline pt-3 flex items-start gap-2">
        <Target className="w-3.5 h-3.5 text-[var(--color-text-dim)] shrink-0 mt-0.5" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            Lesson
          </div>
          <div className="text-sm mt-0.5">{review.keyLesson}</div>
        </div>
      </div>
    </div>
  );
}
