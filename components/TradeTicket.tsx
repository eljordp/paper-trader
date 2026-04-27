"use client";

import { useMemo, useState } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function TradeTicket({
  ticker,
  price,
}: {
  ticker: string;
  price: number;
}) {
  const { portfolio, buy, sell } = usePortfolio();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const position = portfolio?.positions.find((p) => p.ticker === ticker);
  const cash = portfolio?.cash ?? 0;
  const numQty = parseFloat(qty);
  const validQty = Number.isFinite(numQty) && numQty > 0;
  const total = validQty ? numQty * price : 0;

  const maxBuy = price > 0 ? Math.floor((cash / price) * 100) / 100 : 0;
  const maxSell = position?.shares ?? 0;

  const insufficientFunds = side === "buy" && validQty && total > cash;
  const insufficientShares = side === "sell" && validQty && numQty > (position?.shares ?? 0);
  const canSubmit = validQty && !insufficientFunds && !insufficientShares && price > 0;

  const submit = () => {
    setError(null);
    setSuccess(null);
    if (!canSubmit) return;
    try {
      if (side === "buy") buy(ticker, numQty, price);
      else sell(ticker, numQty, price);
      setSuccess(`${side === "buy" ? "Bought" : "Sold"} ${numQty} ${ticker} @ ${money(price)}`);
      setQty("");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed");
    }
  };

  const presets = useMemo(() => {
    if (side === "buy") {
      const max = maxBuy;
      return [
        { label: "25%", value: Math.floor((max * 0.25) * 100) / 100 },
        { label: "50%", value: Math.floor((max * 0.5) * 100) / 100 },
        { label: "Max", value: max },
      ];
    }
    return [
      { label: "25%", value: Math.floor((maxSell * 0.25) * 10000) / 10000 },
      { label: "50%", value: Math.floor((maxSell * 0.5) * 10000) / 10000 },
      { label: "All", value: maxSell },
    ];
  }, [side, maxBuy, maxSell]);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex gap-1 p-1 bg-[var(--color-bg)] rounded-md mb-4">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "flex-1 py-1.5 text-sm font-medium rounded transition-colors",
            side === "buy"
              ? "bg-[var(--color-up)] text-black"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn(
            "flex-1 py-1.5 text-sm font-medium rounded transition-colors",
            side === "sell"
              ? "bg-[var(--color-down)] text-black"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          )}
        >
          Sell
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
              Shares
            </label>
            <div className="text-[11px] text-[var(--color-text-faint)]">
              {side === "buy"
                ? `Max ${maxBuy.toFixed(2)}`
                : `Have ${maxSell}`}
            </div>
          </div>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 h-10 text-base tnum font-mono focus:outline-none focus:border-[var(--color-border-strong)]"
          />
          <div className="flex gap-1 mt-2">
            {presets.map((p) => (
              <button
                key={p.label}
                disabled={p.value <= 0}
                onClick={() => setQty(String(p.value))}
                className="flex-1 py-1 text-[11px] font-mono uppercase tracking-wider rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hairline pt-3 space-y-1.5 text-sm">
          <Row label="Price" value={money(price)} />
          <Row label="Estimated total" value={money(total)} bold />
          <Row label="Buying power" value={money(cash)} muted />
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={cn(
            "w-full h-11 rounded-md font-medium text-sm transition-colors",
            !canSubmit && "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] cursor-not-allowed",
            canSubmit && side === "buy" && "bg-[var(--color-up)] text-black hover:opacity-90",
            canSubmit && side === "sell" && "bg-[var(--color-down)] text-black hover:opacity-90"
          )}
        >
          {insufficientFunds
            ? "Not enough cash"
            : insufficientShares
            ? "Not enough shares"
            : `${side === "buy" ? "Buy" : "Sell"} ${ticker}`}
        </button>

        {error && (
          <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-[var(--color-up)] bg-[var(--color-up)]/10 border border-[var(--color-up)]/30 rounded-md px-3 py-2">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-faint)] text-[11px] uppercase tracking-wider">{label}</span>
      <span className={cn("font-mono tnum", bold && "font-medium", muted && "text-[var(--color-text-dim)]")}>{value}</span>
    </div>
  );
}
