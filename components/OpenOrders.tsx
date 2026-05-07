"use client";

import Link from "next/link";
import { useTransition } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { cancelOrder } from "@/lib/actions";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { X, Clock } from "lucide-react";

export default function OpenOrders() {
  const snapshot = usePortfolio();
  const [pending, startTransition] = useTransition();
  if (!snapshot || snapshot.openOrders.length === 0) return null;

  const handleCancel = (id: string) => {
    if (!confirm("Cancel this order?")) return;
    startTransition(() => cancelOrder(id));
  };

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl flex items-center gap-2">
        <Clock className="w-4 h-4 text-[var(--color-text-dim)]" />
        Open orders
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] ml-1">
          {snapshot.openOrders.length}
        </span>
      </h2>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            <div>Ticker</div>
            <div>Side</div>
            <div>Type</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Trigger</div>
            <div className="text-right">Bracket</div>
            <div></div>
          </div>
          {snapshot.openOrders.map((o) => {
            const isShortSide = o.side === "short" || o.side === "cover";
            const trigger = o.limit_price ?? o.stop_price;
            return (
              <div
                key={o.id}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 items-center text-sm"
              >
                <Link href={`/trade/${o.ticker}`} className="font-mono hover:underline">
                  {o.ticker}
                </Link>
                <div>
                  <span
                    className={cn(
                      "inline-block text-[10px] uppercase font-medium tracking-wider px-1.5 py-0.5 rounded",
                      o.side === "buy" || o.side === "cover"
                        ? "bg-[var(--color-up)]/10 text-[var(--color-up)]"
                        : "bg-[var(--color-down)]/10 text-[var(--color-down)]"
                    )}
                  >
                    {o.side}
                  </span>
                </div>
                <div className="text-[var(--color-text-dim)] uppercase text-[10px] tracking-wider">
                  {o.order_type}
                </div>
                <div className="text-right font-mono tnum">{Number(o.qty).toFixed(2)}</div>
                <div className="text-right font-mono tnum">
                  {trigger ? money(Number(trigger)) : "—"}
                </div>
                <div className="text-right font-mono tnum text-[10px] text-[var(--color-text-dim)]">
                  {o.stop_loss && (
                    <span className="text-[var(--color-down)]">
                      SL ${Number(o.stop_loss).toFixed(2)}
                    </span>
                  )}
                  {o.stop_loss && o.take_profit && <span> · </span>}
                  {o.take_profit && (
                    <span className="text-[var(--color-up)]">
                      TP ${Number(o.take_profit).toFixed(2)}
                    </span>
                  )}
                  {!o.stop_loss && !o.take_profit && "—"}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => handleCancel(o.id)}
                    disabled={pending}
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-down)] p-1 disabled:opacity-50"
                    title="Cancel order"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
