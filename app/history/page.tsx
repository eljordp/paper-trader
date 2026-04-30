"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePortfolio } from "@/components/PortfolioProvider";
import { money, pnlColor, shares as fmtShares } from "@/lib/format";
import { cn } from "@/lib/cn";
import { format } from "date-fns";
import { Pencil, Check, X, Shield, Target } from "lucide-react";
import { updateTradeNote } from "@/lib/actions";

export default function HistoryPage() {
  const snapshot = usePortfolio();
  if (!snapshot) return null;
  const trades = snapshot.trades;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      <h1 className="font-serif text-5xl">Trade history</h1>

      {trades.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
          <div className="text-[var(--color-text-dim)] mb-1">No trades yet</div>
          <div className="text-xs text-[var(--color-text-faint)]">Search a ticker and place your first trade.</div>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.2fr_0.6fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>Date</div>
              <div>Side</div>
              <div>Ticker</div>
              <div className="text-right">Shares</div>
              <div className="text-right">Price</div>
              <div className="text-right">Total</div>
              <div className="text-right">Realized P&L</div>
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

function TradeRow({
  trade,
}: {
  trade: {
    id: string;
    ticker: string;
    side: "buy" | "sell";
    shares: number;
    price: number;
    total: number;
    realized_pnl: number | null;
    notes: string | null;
    triggered_by: "manual" | "stop" | "target" | "eval_failed" | null;
    created_at: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trade.notes ?? "");
  const [, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      await updateTradeNote(trade.id, draft);
      setEditing(false);
    });
  };

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      <div className="grid grid-cols-[1.2fr_0.6fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 text-sm items-center">
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
            trade.realized_pnl != null ? pnlColor(Number(trade.realized_pnl)) : "text-[var(--color-text-faint)]"
          )}
        >
          {trade.realized_pnl != null ? `${Number(trade.realized_pnl) >= 0 ? "+" : ""}${money(Number(trade.realized_pnl))}` : "—"}
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
              <button
                onClick={save}
                className="text-[var(--color-up)] hover:opacity-80 p-1"
                title="Save"
              >
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
    </div>
  );
}
