"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { buy as buyAction, sell as sellAction, shortOpen as shortAction, cover as coverAction } from "@/lib/actions";
import { Shield, Target, Pencil, Brain, AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TradeScore } from "@/lib/brain";

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

  const [side, setSide] = useState<"buy" | "sell" | "short" | "cover">("buy");
  const [qty, setQty] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<TradeScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [strategyId, setStrategyId] = useState<string>("");
  const [isTraining, setIsTraining] = useState(false);

  const cash = account ? Number(account.cash) : 0;
  const numQty = parseFloat(qty);
  const validQty = Number.isFinite(numQty) && numQty > 0;
  const total = validQty ? numQty * price : 0;

  const isOpening = side === "buy" || side === "short";
  const isShortSide = side === "short" || side === "cover";
  const positionMatches = position
    ? (side === "sell" && position.side === "long") ||
      (side === "cover" && position.side === "short") ||
      (side === "buy" && position.side === "long") ||
      (side === "short" && position.side === "short")
    : isOpening;
  const wrongSidePosition = position && !positionMatches;

  const maxBuy = price > 0 ? Math.floor((cash / price) * 100) / 100 : 0;
  // For shorts, margin is 50% of position value
  const maxShort = price > 0 ? Math.floor((cash / (price * 0.5)) * 100) / 100 : 0;
  const maxClose = position ? Number(position.shares) : 0;

  const insufficientFunds = side === "buy" && validQty && total > cash;
  const insufficientMargin = side === "short" && validQty && total * 0.5 > cash;
  const insufficientShares =
    (side === "sell" || side === "cover") &&
    validQty &&
    numQty > maxClose;
  const accountInactive = account && account.status !== "active";

  // Risk math for SL — direction depends on side
  // For longs (buy): stop below entry, target above
  // For shorts: stop above entry, target below
  const slNum = parseFloat(stopLoss);
  const tpNum = parseFloat(takeProfit);
  const slValid = isShortSide
    ? Number.isFinite(slNum) && slNum > price
    : Number.isFinite(slNum) && slNum > 0 && slNum < price;
  const tpValid = isShortSide
    ? Number.isFinite(tpNum) && tpNum > 0 && tpNum < price
    : Number.isFinite(tpNum) && tpNum > 0 && tpNum > price;
  const slInvalid = stopLoss.length > 0 && !slValid;
  const tpInvalid = takeProfit.length > 0 && !tpValid;

  const riskPerShare = slValid ? Math.abs(slNum - price) : 0;
  const totalRisk = riskPerShare * (validQty ? numQty : 0);
  const riskPctOfAccount = totalRisk > 0 && account ? (totalRisk / Number(account.starting_cash)) * 100 : 0;
  const rewardPerShare = tpValid ? Math.abs(price - tpNum) : 0;
  const totalReward = rewardPerShare * (validQty ? numQty : 0);
  const rrRatio = riskPerShare > 0 && rewardPerShare > 0 ? rewardPerShare / riskPerShare : null;

  const canSubmit =
    !!account &&
    validQty &&
    !insufficientFunds &&
    !insufficientMargin &&
    !insufficientShares &&
    !wrongSidePosition &&
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
    if (isOpening) {
      if (slValid) fd.set("stopLoss", String(slNum));
      if (tpValid) fd.set("takeProfit", String(tpNum));
    }
    if (notes.trim().length > 0) fd.set("notes", notes.trim());
    if (strategyId) fd.set("strategyId", strategyId);
    if (isTraining) fd.set("isTraining", "true");
    startTransition(async () => {
      const action =
        side === "buy"
          ? buyAction
          : side === "sell"
          ? sellAction
          : side === "short"
          ? shortAction
          : coverAction;
      const res = await action(fd);
      if (res?.error) setError(res.error);
      if (res?.success) {
        setSuccess(res.success);
        setQty("");
        setStopLoss("");
        setTakeProfit("");
        setNotes("");
        // Keep strategyId + isTraining sticky between trades
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
    if (side === "short") {
      const max = maxShort;
      return [
        { label: "25%", value: Math.floor((max * 0.25) * 100) / 100 },
        { label: "50%", value: Math.floor((max * 0.5) * 100) / 100 },
        { label: "Max", value: max },
      ];
    }
    // sell or cover
    return [
      { label: "25%", value: Math.floor((maxClose * 0.25) * 10000) / 10000 },
      { label: "50%", value: Math.floor((maxClose * 0.5) * 10000) / 10000 },
      { label: "All", value: maxClose },
    ];
  }, [side, maxBuy, maxShort, maxClose]);

  // Debounced brain scoring — on opening trades only
  useEffect(() => {
    if (!isOpening || !validQty || !account || price <= 0) {
      setScore(null);
      return;
    }
    const handle = setTimeout(async () => {
      setScoreLoading(true);
      try {
        const r = await fetch("/api/brain/score", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ticker,
            side,
            shares: numQty,
            price,
            stopLoss: slValid ? slNum : null,
            takeProfit: tpValid ? tpNum : null,
            notes: notes.trim() || null,
          }),
        });
        if (r.ok) {
          const data = (await r.json()) as TradeScore;
          setScore(data);
        }
      } catch {
        // Silent — scoring is best-effort
      } finally {
        setScoreLoading(false);
      }
    }, 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, ticker, numQty, price, slValid ? slNum : 0, tpValid ? tpNum : 0]);

  // Auto-size by risk %: needs a stop loss (works for both long and short)
  const autoSize = (riskPct: number) => {
    if (!slValid || !account) return;
    const accountValue = Number(account.starting_cash);
    const riskDollars = (accountValue * riskPct) / 100;
    const stopDist = Math.abs(slNum - price);
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
      <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-bg)] rounded-md mb-3">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "py-1.5 text-sm font-medium rounded transition-colors",
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
            "py-1.5 text-sm font-medium rounded transition-colors",
            side === "sell"
              ? "bg-[var(--color-down)] text-black"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          )}
        >
          Sell
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--color-bg)] rounded-md mb-4">
        <button
          onClick={() => setSide("short")}
          className={cn(
            "py-1.5 text-xs font-medium uppercase tracking-wider rounded transition-colors",
            side === "short"
              ? "bg-[var(--color-down)] text-black"
              : "text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
          )}
        >
          Short
        </button>
        <button
          onClick={() => setSide("cover")}
          className={cn(
            "py-1.5 text-xs font-medium uppercase tracking-wider rounded transition-colors",
            side === "cover"
              ? "bg-[var(--color-up)] text-black"
              : "text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
          )}
        >
          Cover
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Shares</label>
            <div className="text-[11px] text-[var(--color-text-faint)]">
              {side === "buy"
                ? `Max ${maxBuy.toFixed(2)}`
                : side === "short"
                ? `Max ${maxShort.toFixed(2)}`
                : `Have ${maxClose}`}
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

        {/* Bracket orders — on opening trades (buy or short) */}
        {isOpening && (
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
                    placeholder={isShortSide ? `> ${price.toFixed(2)}` : `< ${price.toFixed(2)}`}
                    color="down"
                    invalid={slInvalid}
                  />
                  <BracketInput
                    icon={<Target className="w-3 h-3" />}
                    label="Target"
                    value={takeProfit}
                    onChange={setTakeProfit}
                    placeholder={isShortSide ? `< ${price.toFixed(2)}` : `> ${price.toFixed(2)}`}
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

        {/* Strategy + training mode */}
        {snapshot && snapshot.strategies && snapshot.strategies.length > 0 && (
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
              Strategy
            </label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 h-9 text-sm focus:outline-none focus:border-[var(--color-border-strong)]"
            >
              <option value="">— Untagged —</option>
              {snapshot.strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {strategyId && (
              <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={isTraining}
                  onChange={(e) => setIsTraining(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-[var(--color-cyan)]"
                />
                <span className="text-[var(--color-text-dim)]">
                  Training mode
                  <span className="text-[var(--color-text-faint)] ml-1">
                    — small size, doesn&apos;t weigh as heavily in stats
                  </span>
                </span>
              </label>
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

        {/* Brain score card — on opening trades only */}
        {isOpening && validQty && (
          <ScoreCard score={score} loading={scoreLoading} />
        )}

        {wrongSidePosition && position && (
          <div className="text-xs text-[var(--color-pro)] bg-[var(--color-pro)]/10 border border-[var(--color-pro)]/30 rounded-md px-3 py-2">
            You're {position.side} {ticker}.{" "}
            {position.side === "long"
              ? "Use Sell or Cover from another ticker first."
              : "Use Cover or Buy on a different ticker first."}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit || pending}
          className={cn(
            "w-full h-11 rounded-md font-medium text-sm transition-colors",
            (!canSubmit || pending) && "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] cursor-not-allowed",
            canSubmit && !pending && (side === "buy" || side === "cover") && "bg-[var(--color-up)] text-black hover:opacity-90",
            canSubmit && !pending && (side === "sell" || side === "short") && "bg-[var(--color-down)] text-black hover:opacity-90"
          )}
        >
          {pending
            ? "Placing…"
            : accountInactive
            ? `Account ${account.status}`
            : insufficientFunds
            ? "Not enough cash"
            : insufficientMargin
            ? "Not enough margin (need 50%)"
            : insufficientShares
            ? "Not enough shares"
            : wrongSidePosition
            ? "Wrong side"
            : slInvalid
            ? "Invalid stop"
            : tpInvalid
            ? "Invalid target"
            : `${
                side === "buy"
                  ? "Buy"
                  : side === "sell"
                  ? "Sell"
                  : side === "short"
                  ? "Short"
                  : "Cover"
              } ${ticker}`}
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

function ScoreCard({ score, loading }: { score: TradeScore | null; loading: boolean }) {
  if (loading && !score) {
    return (
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 flex items-center gap-2.5">
        <Brain className="w-4 h-4 text-[var(--color-text-faint)] animate-pulse" />
        <div className="text-xs text-[var(--color-text-faint)]">Analyzing trade…</div>
      </div>
    );
  }
  if (!score) return null;

  const tone =
    score.score >= 8
      ? { color: "var(--color-up)", rgb: "0, 227, 148", label: "Strong" }
      : score.score >= 6
      ? { color: "var(--color-cyan)", rgb: "79, 220, 224", label: "Decent" }
      : score.score >= 4
      ? { color: "var(--color-pro)", rgb: "245, 158, 11", label: "Weak" }
      : { color: "var(--color-down)", rgb: "255, 77, 110", label: "Don't" };

  return (
    <div
      className="rounded-lg p-3 space-y-2.5 transition-all"
      style={{
        background: `rgba(${tone.rgb}, 0.06)`,
        border: `1px solid rgba(${tone.rgb}, 0.3)`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center font-mono tnum text-base font-bold"
          style={{
            background: `rgba(${tone.rgb}, 0.18)`,
            color: tone.color,
            border: `1px solid rgba(${tone.rgb}, 0.4)`,
          }}
        >
          {score.score}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3 h-3 text-[var(--color-text-faint)]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              Trade analysis
            </span>
          </div>
          <div className="text-sm font-medium leading-tight mt-0.5" style={{ color: tone.color }}>
            {score.headline}
          </div>
        </div>
      </div>
      {score.insights.length > 0 && (
        <ul className="space-y-1">
          {score.insights.map((insight, i) => {
            const flag = score.flags[i] ?? "warn";
            const Icon =
              flag === "ok"
                ? CheckCircle2
                : flag === "danger"
                ? AlertOctagon
                : AlertTriangle;
            const iconClass =
              flag === "ok"
                ? "text-[var(--color-up)]"
                : flag === "danger"
                ? "text-[var(--color-down)]"
                : "text-[var(--color-pro)]";
            return (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                <Icon className={cn("w-3 h-3 shrink-0 mt-[2px]", iconClass)} />
                <span className="text-[var(--color-text-dim)]">{insight}</span>
              </li>
            );
          })}
        </ul>
      )}
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
