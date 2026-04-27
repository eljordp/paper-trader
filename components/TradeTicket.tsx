"use client";

import { useMemo, useState, useTransition } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { buy as buyAction, sell as sellAction } from "@/lib/actions";
import { Shield, Target, Pencil } from "lucide-react";

export default function TradeTicket({
  ticker,
  price,
}: {
  ticker: string;
  price: number;
}) {
  const snapshot = usePortfolio();
  const account = snapshot?.activeAccount;
  const position = snapshot?.positions.find((p) => p.ticker === ticker);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cash = account ? Number(account.cash) : 0;
  const numQty = parseFloat(qty);
  const validQty = Number.isFinite(numQty) && numQty > 0;
  const total = validQty ? numQty * price : 0;

  const maxBuy = price > 0 ? Math.floor((cash / price) * 100) / 100 : 0;
  const maxSell = position ? Number(position.shares) : 0;

  const insufficientFunds = side === "buy" && validQty && total > cash;
  const insufficientShares = side === "sell" && validQty && numQty > maxSell;
  const accountInactive = account && account.status !== "active";

  // Risk math for SL
  const slNum = parseFloat(stopLoss);
  const tpNum = parseFloat(takeProfit);
  const slValid = Number.isFinite(slNum) && slNum > 0 && slNum < price;
  const tpValid = Number.isFinite(tpNum) && tpNum > 0 && tpNum > price;
  const slInvalid = stopLoss.length > 0 && !slValid;
  const tpInvalid = takeProfit.length > 0 && !tpValid;

  const riskPerShare = slValid ? price - slNum : 0;
  const totalRisk = riskPerShare * (validQty ? numQty : 0);
  const riskPctOfAccount = totalRisk > 0 && account ? (totalRisk / Number(account.starting_cash)) * 100 : 0;
  const rewardPerShare = tpValid ? tpNum - price : 0;
  const totalReward = rewardPerShare * (validQty ? numQty : 0);
  const rrRatio = riskPerShare > 0 && rewardPerShare > 0 ? rewardPerShare / riskPerShare : null;

  const canSubmit =
    !!account &&
    validQty &&
    !insufficientFunds &&
    !insufficientShares &&
    !accountInactive &&
    !slInvalid &&
    !tpInvalid &&
    price > 0;

  const submit = () => {
    setError(null);
    setSuccess(null);
    if (!canSubmit || !account) return;
    const fd = new FormData();
    fd.set("accountId", account.id);
    fd.set("ticker", ticker);
    fd.set("qty", String(numQty));
    if (side === "buy") {
      if (slValid) fd.set("stopLoss", String(slNum));
      if (tpValid) fd.set("takeProfit", String(tpNum));
    }
    if (notes.trim().length > 0) fd.set("notes", notes.trim());
    startTransition(async () => {
      const action = side === "buy" ? buyAction : sellAction;
      const res = await action(fd);
      if (res?.error) setError(res.error);
      if (res?.success) {
        setSuccess(res.success);
        setQty("");
        setStopLoss("");
        setTakeProfit("");
        setNotes("");
        setTimeout(() => setSuccess(null), 5000);
      }
    });
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

  // Auto-size by risk %: needs a stop loss
  const autoSize = (riskPct: number) => {
    if (!slValid || !account) return;
    const accountValue = Number(account.starting_cash);
    const riskDollars = (accountValue * riskPct) / 100;
    const stopDist = price - slNum;
    if (stopDist <= 0) return;
    const computedShares = Math.floor((riskDollars / stopDist) * 100) / 100;
    if (computedShares > 0) setQty(String(computedShares));
  };

  if (!account) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 text-sm text-[var(--color-text-dim)]">
        Sign in to trade.
      </div>
    );
  }

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
            <label className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Shares</label>
            <div className="text-[11px] text-[var(--color-text-faint)]">
              {side === "buy" ? `Max ${maxBuy.toFixed(2)}` : `Have ${maxSell}`}
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

        {/* Bracket orders — only on buy */}
        {side === "buy" && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] flex items-center gap-1"
            >
              <Shield className="w-3 h-3" />
              {showAdvanced ? "Hide" : "Add"} stop / target
            </button>
            {showAdvanced && (
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <BracketInput
                    icon={<Shield className="w-3 h-3" />}
                    label="Stop"
                    value={stopLoss}
                    onChange={setStopLoss}
                    placeholder={`< ${price.toFixed(2)}`}
                    color="down"
                    invalid={slInvalid}
                  />
                  <BracketInput
                    icon={<Target className="w-3 h-3" />}
                    label="Target"
                    value={takeProfit}
                    onChange={setTakeProfit}
                    placeholder={`> ${price.toFixed(2)}`}
                    color="up"
                    invalid={tpInvalid}
                  />
                </div>
                {slValid && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                      Auto-size for account risk
                    </div>
                    <div className="flex gap-1">
                      {[0.5, 1, 2].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => autoSize(p)}
                          className="flex-1 py-1.5 text-[11px] font-mono rounded bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
                        >
                          {p}% R
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(slValid || tpValid) && (
                  <div className="bg-[var(--color-bg)] rounded-md p-2.5 space-y-1 text-[11px] font-mono">
                    {slValid && validQty && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-faint)]">Risk</span>
                        <span className="text-[var(--color-down)] tnum">
                          ${totalRisk.toFixed(2)} ({riskPctOfAccount.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                    {tpValid && validQty && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-faint)]">Reward</span>
                        <span className="text-[var(--color-up)] tnum">+${totalReward.toFixed(2)}</span>
                      </div>
                    )}
                    {rrRatio && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-text-faint)]">R/R</span>
                        <span className="text-[var(--color-text)] tnum">{rrRatio.toFixed(2)} : 1</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" />
            {showNotes ? "Hide" : "Add"} note
          </button>
          {showNotes && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this trade? Setup, thesis, conviction…"
              rows={2}
              className="mt-2 w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2 text-xs placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)] resize-none"
            />
          )}
        </div>

        <div className="hairline pt-3 space-y-1.5 text-sm">
          <Row label="Price" value={money(price)} />
          <Row label="Estimated total" value={money(total)} bold />
          <Row label="Buying power" value={money(cash)} muted />
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit || pending}
          className={cn(
            "w-full h-11 rounded-md font-medium text-sm transition-colors",
            (!canSubmit || pending) && "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] cursor-not-allowed",
            canSubmit && !pending && side === "buy" && "bg-[var(--color-up)] text-black hover:opacity-90",
            canSubmit && !pending && side === "sell" && "bg-[var(--color-down)] text-black hover:opacity-90"
          )}
        >
          {pending
            ? "Placing…"
            : accountInactive
            ? `Account ${account.status}`
            : insufficientFunds
            ? "Not enough cash"
            : insufficientShares
            ? "Not enough shares"
            : slInvalid
            ? "Invalid stop"
            : tpInvalid
            ? "Invalid target"
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

function BracketInput({
  icon,
  label,
  value,
  onChange,
  placeholder,
  color,
  invalid,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  color: "up" | "down";
  invalid: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className={color === "up" ? "text-[var(--color-up)]" : "text-[var(--color-down)]"}>{icon}</span>
        <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</label>
      </div>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full bg-[var(--color-bg)] border rounded-md px-2.5 h-8 text-sm tnum font-mono focus:outline-none",
          invalid
            ? "border-[var(--color-down)]/50 focus:border-[var(--color-down)]"
            : "border-[var(--color-border)] focus:border-[var(--color-border-strong)]"
        )}
      />
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
