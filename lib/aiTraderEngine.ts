import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/admin";
import { getCandles, getQuote, getOptionsChain, getOptionMidPrice } from "@/lib/yahoo";
import type { StrategyRules, EntryRule, EntryEval } from "@/lib/aiLab";
import { evalOteLong, evalOteShort, computeStdvOpenLevels, evalVwapBounceLong, evalVwapBounceShort } from "@/lib/aiLab";
import {
  getAiTraderProfile,
  getAllAiTraderProfiles,
  getAiProfileConfig,
} from "@/lib/aiTrader";
import {
  getFuturesSpec,
  instrumentType,
  computeRealizedPnl,
  computeUnrealizedPnl,
  parseOptionSymbol,
  pickAtmStrike,
  pickExpiration,
  OPTION_CONTRACT_MULTIPLIER,
} from "@/lib/instruments";

type Sb = SupabaseClient;

type StrategyRow = {
  id: string;
  name: string;
  hypothesis: string | null;
  instruments: string[];
  rules: StrategyRules;
  max_account_risk_pct: number | null;
  max_concurrent_positions: number | null;
  max_trades_per_day: number | null;
  status: string;
};

type PositionRow = {
  id: string;
  account_id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  side: "long" | "short";
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string;
  instrument_type: "stock" | "futures";
  margin_held: number | null;
};

type AccountRow = {
  id: string;
  user_id: string;
  cash: number;
  starting_cash: number;
  status: string;
};

type TickResult = {
  entriesFired: Array<{ strategyId: string; ticker: string; side: string; price: number }>;
  exitsClosed: Array<{ ticker: string; reason: string; price: number; pnl: number }>;
  errors: string[];
};

// 5-minute bars are what we pull for AI Trader strategies
const CANDLE_RANGE = "5D" as const;
const BARS_PER_HOUR = 12;
const DEFAULT_TIME_EXIT_BARS = 240; // 20h of 5m bars

function evalEntryLastCandle(
  rule: EntryRule,
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>,
): EntryEval {
  if (candles.length < 2) return { hit: false };
  const i = candles.length - 1;
  const c = candles[i];
  switch (rule.type) {
    case "price_drop": {
      const lookbackBars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - lookbackBars];
      if (!past) return { hit: false };
      return ((c.close - past.close) / past.close) * 100 <= rule.magnitude_pct
        ? { hit: true }
        : { hit: false };
    }
    case "price_pop": {
      const lookbackBars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - lookbackBars];
      if (!past) return { hit: false };
      return ((c.close - past.close) / past.close) * 100 >= rule.magnitude_pct
        ? { hit: true }
        : { hit: false };
    }
    case "breakout_above": {
      if (i < rule.lookback_bars) return { hit: false };
      let high = -Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++)
        if (candles[j].high > high) high = candles[j].high;
      // Two ways to fire:
      // 1. Clean close above the lookback high (the strict definition)
      // 2. Touch-and-hold: bar's HIGH pierced the level, close is in the
      //    upper half of the bar's range, and close is within 0.2% of the
      //    level. This catches the "kissed and held" pattern where price
      //    tags the breakout line on intra-bar prints but closes a tick or
      //    two below — which was the whole story of today's ES setup.
      const strictBreakout = c.close > high && candles[i - 1].close <= high;
      const range = c.high - c.low;
      const midRange = c.low + range / 2;
      const touchAndHold =
        c.high >= high &&
        c.close >= midRange &&
        c.close >= high * 0.998 &&
        candles[i - 1].close <= high;
      return strictBreakout || touchAndHold ? { hit: true } : { hit: false };
    }
    case "breakdown_below": {
      if (i < rule.lookback_bars) return { hit: false };
      let low = Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++)
        if (candles[j].low < low) low = candles[j].low;
      // Mirror of breakout_above: strict close-below OR touch-and-hold where
      // the bar's LOW pierced the level, close is in the lower half, and
      // close is within 0.2% of the level.
      const strictBreakdown = c.close < low && candles[i - 1].close >= low;
      const range = c.high - c.low;
      const midRange = c.low + range / 2;
      const touchAndHold =
        c.low <= low &&
        c.close <= midRange &&
        c.close <= low * 1.002 &&
        candles[i - 1].close >= low;
      return strictBreakdown || touchAndHold ? { hit: true } : { hit: false };
    }
    case "ote_long": {
      const candlesFull = candles.map((b) => ({ ...b, volume: b.volume ?? 0 }));
      return evalOteLong(
        candlesFull, i,
        rule.swing_lookback_bars,
        rule.fib_min ?? 0.62,
        rule.fib_max ?? 0.79,
        rule.min_swing_pct ?? 0.5,
      );
    }
    case "ote_short": {
      const candlesFull = candles.map((b) => ({ ...b, volume: b.volume ?? 0 }));
      return evalOteShort(
        candlesFull, i,
        rule.swing_lookback_bars,
        rule.fib_min ?? 0.62,
        rule.fib_max ?? 0.79,
        rule.min_swing_pct ?? 0.5,
      );
    }
    case "stdv_open_above": {
      const candlesFull = candles.map((b) => ({ ...b, volume: b.volume ?? 0 }));
      const levels = computeStdvOpenLevels(
        candlesFull, i,
        rule.lookback_days ?? 20,
        rule.k_sigma ?? 1.0,
      );
      if (!levels) return { hit: false };
      const prev = candles[i - 1].close;
      return c.close > levels.upperThreshold && prev <= levels.upperThreshold
        ? { hit: true }
        : { hit: false };
    }
    case "stdv_open_below": {
      const candlesFull = candles.map((b) => ({ ...b, volume: b.volume ?? 0 }));
      const levels = computeStdvOpenLevels(
        candlesFull, i,
        rule.lookback_days ?? 20,
        rule.k_sigma ?? 1.0,
      );
      if (!levels) return { hit: false };
      const prev = candles[i - 1].close;
      return c.close < levels.lowerThreshold && prev >= levels.lowerThreshold
        ? { hit: true }
        : { hit: false };
    }
    case "vwap_bounce_long": {
      const candlesFull = candles.map((b) => ({ ...b, volume: b.volume ?? 0 }));
      return evalVwapBounceLong(
        candlesFull, i,
        rule.min_bars_in_regime ?? 6,
        rule.touch_within_bars ?? 3,
        rule.touch_distance_pct ?? 0.05,
      );
    }
    case "vwap_bounce_short": {
      const candlesFull = candles.map((b) => ({ ...b, volume: b.volume ?? 0 }));
      return evalVwapBounceShort(
        candlesFull, i,
        rule.min_bars_in_regime ?? 6,
        rule.touch_within_bars ?? 3,
        rule.touch_distance_pct ?? 0.05,
      );
    }
    // RSI / MA-cross variants are out of scope for the always-on cron — they
    // need indicator series and the live signal cadence is forgiving without them.
    default:
      return { hit: false };
  }
}

// Describe how close a rule is to triggering on the current candle. Returned
// values are short, human-readable strings used in tick_pulse decision rows
// so the public page can show "what the brain is watching" instead of going
// silent between trades. closenessPct: 0 = far/wrong-direction, 100 = trigger.
type RuleStatus = {
  desc: string;        // e.g. "QQQ 15-min change +0.18% / needs +0.50%"
  closenessPct: number;
};

function describeRuleStatus(
  ticker: string,
  rule: EntryRule,
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>,
): RuleStatus | null {
  if (candles.length < 2) return null;
  const i = candles.length - 1;
  const c = candles[i];
  switch (rule.type) {
    case "price_drop": {
      const bars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - bars];
      if (!past) return null;
      const pct = ((c.close - past.close) / past.close) * 100;
      const need = rule.magnitude_pct; // negative
      const closeness = need >= 0 ? 0 : Math.max(0, Math.min(100, (pct / need) * 100));
      return {
        desc: `${ticker} ${rule.lookback_minutes}m chg ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% / need ≤ ${need.toFixed(2)}%`,
        closenessPct: closeness,
      };
    }
    case "price_pop": {
      const bars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - bars];
      if (!past) return null;
      const pct = ((c.close - past.close) / past.close) * 100;
      const need = rule.magnitude_pct; // positive
      const closeness = need <= 0 ? 0 : Math.max(0, Math.min(100, (pct / need) * 100));
      return {
        desc: `${ticker} ${rule.lookback_minutes}m chg ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% / need ≥ +${need.toFixed(2)}%`,
        closenessPct: closeness,
      };
    }
    case "breakout_above": {
      if (i < rule.lookback_bars) return null;
      let high = -Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++)
        if (candles[j].high > high) high = candles[j].high;
      const gapPct = ((c.close - high) / high) * 100;
      // closeness: at high = 100, 1% below = ~0
      const closeness = Math.max(0, Math.min(100, 100 + gapPct * 100));
      return {
        desc: `${ticker} px $${c.close.toFixed(2)} / ${rule.lookback_bars}-bar high $${high.toFixed(2)} (${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%)`,
        closenessPct: closeness,
      };
    }
    case "breakdown_below": {
      if (i < rule.lookback_bars) return null;
      let low = Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++)
        if (candles[j].low < low) low = candles[j].low;
      const gapPct = ((c.close - low) / low) * 100;
      const closeness = Math.max(0, Math.min(100, 100 - gapPct * 100));
      return {
        desc: `${ticker} px $${c.close.toFixed(2)} / ${rule.lookback_bars}-bar low $${low.toFixed(2)} (${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%)`,
        closenessPct: closeness,
      };
    }
    default:
      // OTE / stdv / VWAP / RSI / MA-cross: too contextual for a single-line
      // closeness gauge. Just label the rule type so the pulse still shows
      // the brain looked at it.
      return {
        desc: `${ticker} watching ${rule.type}`,
        closenessPct: 0,
      };
  }
}

async function logDecision(
  sb: Sb,
  userId: string,
  data: {
    strategy_id?: string | null;
    trade_id?: string | null;
    decision_type: string;
    inputs?: unknown;
    output?: unknown;
    rationale: string;
  },
) {
  await sb.from("ai_decisions").insert({
    user_id: userId,
    strategy_id: data.strategy_id ?? null,
    trade_id: data.trade_id ?? null,
    decision_type: data.decision_type,
    inputs: data.inputs ?? null,
    output: data.output ?? null,
    rationale: data.rationale,
  });
}

async function snapshotEquity(sb: Sb, accountId: string) {
  const { data: account } = await sb
    .from("accounts")
    .select("cash")
    .eq("id", accountId)
    .single();
  if (!account) return;
  const { data: positions } = await sb
    .from("positions")
    .select("ticker, shares, avg_cost, side, instrument_type, margin_held")
    .eq("account_id", accountId);
  const list = (positions ?? []) as Array<{
    ticker: string;
    shares: number;
    avg_cost: number;
    side: "long" | "short";
    instrument_type: "stock" | "futures";
    margin_held: number | null;
  }>;
  let positionsValue = 0;
  let shortCredit = 0;
  if (list.length > 0) {
    const tickers = Array.from(new Set(list.map((p) => p.ticker)));
    const quotes: Record<string, { price: number } | undefined> = {};
    for (const t of tickers) {
      const q = await getQuote(t).catch(() => null);
      if (q?.price) quotes[t] = { price: q.price };
    }
    for (const p of list) {
      const px = quotes[p.ticker]?.price ?? Number(p.avg_cost);
      if (p.instrument_type === "futures") {
        // Futures contribution to equity = margin held (already deducted from
        // cash on open) + unrealized PnL at the current mark
        const futSpec = getFuturesSpec(p.ticker);
        const pointValue = futSpec?.pointValue ?? 1;
        const unrealized = computeUnrealizedPnl({
          side: p.side,
          instrumentType: "futures",
          entry: Number(p.avg_cost),
          current: px,
          qty: Number(p.shares),
          pointValue,
        });
        positionsValue += Number(p.margin_held ?? 0) + unrealized;
      } else {
        const v = Number(p.shares) * px;
        if (p.side === "short") {
          positionsValue -= v;
          shortCredit += Number(p.shares) * Number(p.avg_cost);
        } else {
          positionsValue += v;
        }
      }
    }
  }
  const cash = Number((account as { cash: number }).cash);
  const equity = cash + positionsValue + shortCredit;
  await sb.from("equity_snapshots").insert({
    account_id: accountId,
    cash,
    positions_value: positionsValue + shortCredit,
    equity,
  });
}

async function closeLong(
  sb: Sb,
  account: AccountRow,
  pos: PositionRow,
  price: number,
  reason: "stop" | "target" | "time_exit",
  strategyId: string | null,
): Promise<number> {
  const isFutures = pos.instrument_type === "futures";
  const futSpec = isFutures ? getFuturesSpec(pos.ticker) : null;
  const pointValue = futSpec?.pointValue ?? 1;

  const realizedPnl = computeRealizedPnl({
    side: "long",
    instrumentType: pos.instrument_type,
    entry: Number(pos.avg_cost),
    exit: price,
    qty: Number(pos.shares),
    pointValue,
  });

  // Cash impact:
  //  - Stocks long: cash += qty * exit_price (sell receives proceeds)
  //  - Futures long: cash += margin_held + realized_pnl (margin returned + PnL settled)
  const cashDelta = isFutures
    ? Number(pos.margin_held ?? 0) + realizedPnl
    : Number(pos.shares) * price;

  await sb.from("positions").delete().eq("id", pos.id);
  await sb.from("trades").insert({
    account_id: account.id,
    ticker: pos.ticker,
    side: "sell",
    shares: pos.shares,
    price,
    total: Number(pos.shares) * price,
    realized_pnl: realizedPnl,
    triggered_by: reason === "time_exit" ? "manual" : reason,
    ai_strategy_id: strategyId,
    notes: `AI auto-exit: ${reason}`,
    instrument_type: pos.instrument_type,
    contracts: isFutures ? Number(pos.shares) : null,
    point_value: isFutures ? pointValue : null,
  });
  await sb
    .from("accounts")
    .update({ cash: Number(account.cash) + cashDelta })
    .eq("id", account.id);
  return realizedPnl;
}

async function closeShort(
  sb: Sb,
  account: AccountRow,
  pos: PositionRow,
  price: number,
  reason: "stop" | "target" | "time_exit",
  strategyId: string | null,
): Promise<number> {
  const isFutures = pos.instrument_type === "futures";
  const futSpec = isFutures ? getFuturesSpec(pos.ticker) : null;
  const pointValue = futSpec?.pointValue ?? 1;

  const realizedPnl = computeRealizedPnl({
    side: "short",
    instrumentType: pos.instrument_type,
    entry: Number(pos.avg_cost),
    exit: price,
    qty: Number(pos.shares),
    pointValue,
  });

  // Cash impact:
  //  - Stocks short: cash -= qty * exit_price (cover pays out)
  //  - Futures short: cash += margin_held + realized_pnl (margin returned + PnL settled)
  const cashDelta = isFutures
    ? Number(pos.margin_held ?? 0) + realizedPnl
    : -Number(pos.shares) * price;

  await sb.from("positions").delete().eq("id", pos.id);
  await sb.from("trades").insert({
    account_id: account.id,
    ticker: pos.ticker,
    side: "cover",
    shares: pos.shares,
    price,
    total: Number(pos.shares) * price,
    realized_pnl: realizedPnl,
    triggered_by: reason === "time_exit" ? "manual" : reason,
    ai_strategy_id: strategyId,
    notes: `AI auto-exit: ${reason}`,
    instrument_type: pos.instrument_type,
    contracts: isFutures ? Number(pos.shares) : null,
    point_value: isFutures ? pointValue : null,
  });
  await sb
    .from("accounts")
    .update({ cash: Number(account.cash) + cashDelta })
    .eq("id", account.id);
  return realizedPnl;
}

async function processExits(
  sb: Sb,
  account: AccountRow,
): Promise<TickResult["exitsClosed"]> {
  const closed: TickResult["exitsClosed"] = [];
  const { data: positions } = await sb
    .from("positions")
    .select("id, account_id, ticker, shares, avg_cost, side, stop_loss, take_profit, opened_at, instrument_type, margin_held")
    .eq("account_id", account.id);
  const list = (positions ?? []) as PositionRow[];
  if (list.length === 0) return closed;

  // Pull the most recent trade per (ticker, account, side=long/short open) to
  // resolve which strategy seeded the position.
  for (const pos of list) {
    const openSide = pos.side === "long" ? "buy" : "short";
    const { data: trades } = await sb
      .from("trades")
      .select("id, ai_strategy_id, created_at")
      .eq("account_id", account.id)
      .eq("ticker", pos.ticker)
      .eq("side", openSide)
      .order("created_at", { ascending: false })
      .limit(1);
    const seed = (trades?.[0] ?? null) as
      | { id: string; ai_strategy_id: string | null; created_at: string }
      | null;
    const strategyId = seed?.ai_strategy_id ?? null;

    let strategy: StrategyRow | null = null;
    if (strategyId) {
      const { data: s } = await sb
        .from("ai_strategies")
        .select("*")
        .eq("id", strategyId)
        .maybeSingle();
      strategy = (s as StrategyRow | null) ?? null;
    }

    const quote = await getQuote(pos.ticker).catch(() => null);
    if (!quote?.price) continue;
    const px = Number(quote.price);

    let reason: "stop" | "target" | "time_exit" | null = null;
    if (pos.side === "long") {
      if (pos.stop_loss != null && px <= Number(pos.stop_loss)) reason = "stop";
      else if (pos.take_profit != null && px >= Number(pos.take_profit)) reason = "target";
    } else {
      if (pos.stop_loss != null && px >= Number(pos.stop_loss)) reason = "stop";
      else if (pos.take_profit != null && px <= Number(pos.take_profit)) reason = "target";
    }

    if (!reason && strategy) {
      const timeExitBars = strategy.rules.exit.time_exit_bars ?? DEFAULT_TIME_EXIT_BARS;
      const deadlineMs =
        new Date(seed?.created_at ?? pos.opened_at).getTime() +
        timeExitBars * 5 * 60_000;
      if (Date.now() >= deadlineMs) reason = "time_exit";
    }

    if (!reason) continue;

    const pnl =
      pos.side === "long"
        ? await closeLong(sb, account, pos, px, reason, strategyId)
        : await closeShort(sb, account, pos, px, reason, strategyId);

    // Refresh local cash for subsequent loop iterations
    const { data: refreshed } = await sb
      .from("accounts")
      .select("cash")
      .eq("id", account.id)
      .single();
    if (refreshed) account.cash = Number((refreshed as { cash: number }).cash);

    await logDecision(sb, account.user_id, {
      strategy_id: strategyId,
      decision_type: "trade_exited",
      inputs: { ticker: pos.ticker, exit_price: px, reason },
      output: { realized_pnl: pnl },
      rationale:
        reason === "time_exit"
          ? `Closed ${pos.ticker} ${pos.side} at $${px.toFixed(2)} after holding ${strategy?.rules.exit.time_exit_bars ?? DEFAULT_TIME_EXIT_BARS} bars without hitting stop or target. P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`
          : `Closed ${pos.ticker} ${pos.side} at $${px.toFixed(2)} — ${reason === "stop" ? "stop loss hit" : "take profit hit"}. P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`,
    });

    // Post-trade review: replay candles between entry and exit, compute MFE/MAE,
    // hold time, and a verdict on whether the thesis held. Stored as its own
    // decision row so the page surfaces "what we learned" alongside the exit.
    try {
      const entryAt = new Date(seed?.created_at ?? pos.opened_at);
      const entryPx = Number(pos.avg_cost);
      const tradeCandles = await getCandles(pos.ticker, CANDLE_RANGE).catch(() => null);
      if (tradeCandles && tradeCandles.length > 0) {
        const entryMs = entryAt.getTime();
        const exitMs = Date.now();
        const window = tradeCandles.filter(
          (b) => b.time * 1000 >= entryMs && b.time * 1000 <= exitMs,
        );
        let mfe = 0; // best PnL pct seen during the trade
        let mae = 0; // worst PnL pct seen during the trade
        for (const b of window) {
          const movePct =
            pos.side === "long"
              ? ((b.high - entryPx) / entryPx) * 100
              : ((entryPx - b.low) / entryPx) * 100;
          const adversePct =
            pos.side === "long"
              ? ((b.low - entryPx) / entryPx) * 100
              : ((entryPx - b.high) / entryPx) * 100;
          if (movePct > mfe) mfe = movePct;
          if (adversePct < mae) mae = adversePct;
        }
        const holdMin = Math.max(1, Math.round((exitMs - entryMs) / 60_000));
        const realizedPct = ((px - entryPx) / entryPx) * 100 * (pos.side === "long" ? 1 : -1);

        let verdict: string;
        let thesisHeld: boolean | null;
        if (reason === "target") {
          verdict = "Thesis held — target reached.";
          thesisHeld = true;
        } else if (reason === "stop") {
          // Did it ever go in our favor first? If MFE > |MAE|, the trade had
          // legs and we got shaken out. If MAE was earlier than MFE allowed,
          // the entry was just wrong.
          if (mfe >= Math.abs(realizedPct)) {
            verdict = `Faked us out — went +${mfe.toFixed(2)}% in favor first, then reversed and stopped.`;
            thesisHeld = false;
          } else {
            verdict = "Wrong from entry — never moved in our favor.";
            thesisHeld = false;
          }
        } else {
          verdict =
            realizedPct >= 0
              ? "Time-exit green — slow grind, no clean target."
              : "Time-exit red — thesis never materialized in the window.";
          thesisHeld = realizedPct >= 0;
        }

        const ruleText = strategy?.rules.entry?.type ?? "unknown rule";
        const hypothesis = strategy?.hypothesis ?? null;

        await logDecision(sb, account.user_id, {
          strategy_id: strategyId,
          decision_type: "post_trade_review",
          inputs: {
            ticker: pos.ticker,
            side: pos.side,
            entry_price: entryPx,
            exit_price: px,
            entry_rule: ruleText,
            hypothesis,
            hold_minutes: holdMin,
            realized_pct: realizedPct,
            mfe_pct: mfe,
            mae_pct: mae,
            reason,
            thesis_held: thesisHeld,
          },
          output: { thesis_held: thesisHeld },
          rationale: `Review of ${pos.ticker} ${pos.side}: ${verdict} Held ${holdMin}m. Realized ${realizedPct >= 0 ? "+" : ""}${realizedPct.toFixed(2)}%. Max favorable +${mfe.toFixed(2)}%, max adverse ${mae.toFixed(2)}%. Strategy "${strategy?.name ?? "n/a"}" using ${ruleText}.`,
        });
      }
    } catch {
      // Review is best-effort. Don't block the exit if candle replay fails.
    }

    closed.push({ ticker: pos.ticker, reason, price: px, pnl });
  }

  return closed;
}

async function processEntries(
  sb: Sb,
  account: AccountRow,
  slug?: string,
): Promise<TickResult["entriesFired"]> {
  const fired: TickResult["entriesFired"] = [];
  type PulseEntry = {
    strategy: string;
    ticker: string;
    status: string;
    closenessPct: number;
  };
  const pulses: PulseEntry[] = [];

  const { data: liveStrategies } = await sb
    .from("ai_strategies")
    .select(
      "id, name, hypothesis, instruments, rules, max_account_risk_pct, max_concurrent_positions, max_trades_per_day, status",
    )
    .eq("user_id", account.user_id)
    .eq("status", "live");
  const strategies = (liveStrategies ?? []) as StrategyRow[];
  if (strategies.length === 0) return fired;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  for (const s of strategies) {
    const maxTradesPerDay = s.max_trades_per_day ?? 5;
    const { data: todayTrades } = await sb
      .from("trades")
      .select("id")
      .eq("ai_strategy_id", s.id)
      .gte("created_at", todayStart.toISOString());
    if ((todayTrades?.length ?? 0) >= maxTradesPerDay) continue;

    const { count: openCount } = await sb
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .in("ticker", s.instruments);
    const maxConcurrent = s.max_concurrent_positions ?? 3;
    if ((openCount ?? 0) >= maxConcurrent) continue;

    for (const ticker of s.instruments) {
      const futSpec = getFuturesSpec(ticker);
      const isFutures = futSpec != null;
      const instType = instrumentType(ticker);

      let candles;
      try {
        candles = await getCandles(ticker, CANDLE_RANGE);
      } catch {
        pulses.push({
          strategy: s.name,
          ticker,
          status: `${ticker} quote fetch failed`,
          closenessPct: 0,
        });
        continue;
      }
      if (!candles || candles.length < 50) {
        pulses.push({
          strategy: s.name,
          ticker,
          status: `${ticker} not enough history yet`,
          closenessPct: 0,
        });
        continue;
      }

      const lastCandle = candles[candles.length - 1];
      if (s.rules.time_window_utc) {
        const hr = new Date(lastCandle.time * 1000).getUTCHours();
        if (
          hr < s.rules.time_window_utc[0] ||
          hr >= s.rules.time_window_utc[1]
        ) {
          pulses.push({
            strategy: s.name,
            ticker,
            status: `${ticker} outside time window ${s.rules.time_window_utc[0]}-${s.rules.time_window_utc[1]} UTC (now ${hr})`,
            closenessPct: 0,
          });
          continue;
        }
      }

      const ruleStatus = describeRuleStatus(ticker, s.rules.entry, candles);
      const entryEval = evalEntryLastCandle(s.rules.entry, candles);
      if (!entryEval.hit) {
        pulses.push({
          strategy: s.name,
          ticker,
          status: ruleStatus?.desc ?? `${ticker} ${s.rules.entry.type} watched`,
          closenessPct: ruleStatus?.closenessPct ?? 0,
        });
        continue;
      }

      // Don't double-enter — skip if any trade for this strategy+ticker fired
      // in the last hour
      const sixtyMinAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count: recentCount } = await sb
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("ai_strategy_id", s.id)
        .eq("ticker", ticker)
        .gte("created_at", sixtyMinAgo);
      if ((recentCount ?? 0) > 0) continue;

      // Skip if a position is already open in this ticker
      const { data: openPos } = await sb
        .from("positions")
        .select("id")
        .eq("account_id", account.id)
        .eq("ticker", ticker)
        .maybeSingle();
      if (openPos) continue;

      const entryPrice = Number(lastCandle.close);
      const stopLossPct = s.rules.exit.stop_loss_pct;
      const takeProfitPct = s.rules.exit.take_profit_pct;
      const stopPrice =
        entryEval.stopOverride != null
          ? entryEval.stopOverride
          : s.rules.side === "long"
            ? entryPrice * (1 + stopLossPct / 100)
            : entryPrice * (1 - stopLossPct / 100);
      const targetPrice =
        entryEval.targetOverride != null
          ? entryEval.targetOverride
          : s.rules.side === "long"
            ? entryPrice * (1 + takeProfitPct / 100)
            : entryPrice * (1 - takeProfitPct / 100);
      const stopDistance = Math.abs(entryPrice - stopPrice);
      if (stopDistance <= 0) continue;
      // Sanity: structural stop must be on the right side of entry
      if (s.rules.side === "long" && stopPrice >= entryPrice) continue;
      if (s.rules.side === "short" && stopPrice <= entryPrice) continue;

      const accountRiskPct = s.max_account_risk_pct ?? 1.0;
      const riskBudget =
        (Number(account.starting_cash) * accountRiskPct) / 100;

      // Notional cap: a single trade can't eat more than maxNotionalPctPerTrade
      // of the account, regardless of what the risk math says. Default 30%
      // so the AI can carry 3+ concurrent positions. Lookup profile config
      // by slug; fall back to 0.30 if not present.
      const profileConfig = slug ? getAiProfileConfig(slug) : null;
      const maxNotionalPct = profileConfig?.maxNotionalPctPerTrade ?? 0.30;
      const maxNotional = Number(account.starting_cash) * maxNotionalPct;

      // Sizing diverges by instrument:
      //  - Stocks: fractional shares allowed; qty = riskBudget / stopDistance
      //  - Futures: whole contracts only; qty = floor(riskBudget / (stopDistance * pointValue))
      let qty: number;
      let marginHeld = 0;
      if (isFutures && futSpec) {
        const riskPerContract = stopDistance * futSpec.pointValue;
        if (riskPerContract <= 0) continue;
        qty = Math.floor(riskBudget / riskPerContract);
        if (qty < 1) continue; // not enough room for even 1 contract at this stop distance
        // Cap by notional value of the position (qty * pointValue * entry).
        // For futures, notional cap is applied at 2x stock cap because futures
        // are inherently leveraged — capping at 30% of cash would let you
        // hold one tiny contract; 60% gives meaningful exposure.
        const notional = qty * futSpec.pointValue * entryPrice;
        const futuresNotionalCap = maxNotional * 2;
        if (notional > futuresNotionalCap) {
          qty = Math.floor(futuresNotionalCap / (futSpec.pointValue * entryPrice));
          if (qty < 1) continue;
        }
        marginHeld = qty * futSpec.dayTradeMargin;
      } else {
        qty = Math.floor((riskBudget / stopDistance) * 100) / 100;
        if (qty <= 0) continue;
        // Cap by notional (qty * entry) so one trade doesn't eat the whole
        // account. If the risk-based qty would exceed the cap, scale down.
        const notional = qty * entryPrice;
        if (notional > maxNotional) {
          qty = Math.floor((maxNotional / entryPrice) * 100) / 100;
          if (qty <= 0) continue;
        }
      }

      // Cash check
      //  - Stocks long: need cash >= qty * entry
      //  - Stocks short: need cash >= qty * entry * 0.5 (margin proxy)
      //  - Futures (long or short): need cash >= margin held
      const cashRequired = isFutures
        ? marginHeld
        : s.rules.side === "long"
          ? qty * entryPrice
          : qty * entryPrice * 0.5;
      if (cashRequired > Number(account.cash)) continue;

      // Insert position
      await sb.from("positions").insert({
        account_id: account.id,
        ticker,
        shares: qty,
        avg_cost: entryPrice,
        stop_loss: stopPrice,
        take_profit: targetPrice,
        side: s.rules.side,
        instrument_type: instType,
        margin_held: marginHeld,
      });

      // Insert trade
      const tradeSide = s.rules.side === "long" ? "buy" : "short";
      const total = qty * entryPrice;
      const { data: tradeRow } = await sb
        .from("trades")
        .insert({
          account_id: account.id,
          ticker,
          side: tradeSide,
          shares: qty,
          price: entryPrice,
          total,
          notes: `AI: ${s.name}`,
          triggered_by: "manual",
          ai_strategy_id: s.id,
          instrument_type: instType,
          contracts: isFutures ? qty : null,
          point_value: isFutures && futSpec ? futSpec.pointValue : null,
        })
        .select("id")
        .single();

      // Update cash
      //  - Stocks long: cash -= qty * entry
      //  - Stocks short: cash += qty * entry (proceeds)
      //  - Futures: cash -= margin held (margin model — symmetric for long/short)
      const cashDelta = isFutures
        ? -marginHeld
        : s.rules.side === "long"
          ? -qty * entryPrice
          : qty * entryPrice;
      await sb
        .from("accounts")
        .update({ cash: Number(account.cash) + cashDelta })
        .eq("id", account.id);
      account.cash = Number(account.cash) + cashDelta;

      await sb
        .from("ai_strategies")
        .update({ last_signal_at: new Date().toISOString() })
        .eq("id", s.id);

      await logDecision(sb, account.user_id, {
        strategy_id: s.id,
        trade_id: (tradeRow as { id: string } | null)?.id ?? null,
        decision_type: "trade_filled",
        inputs: {
          ticker,
          entry_price: entryPrice,
          stop_price: stopPrice,
          target_price: targetPrice,
          qty,
          condition: s.rules.entry,
        },
        output: { success: true },
        rationale: (() => {
          const stopActualPct = ((stopPrice - entryPrice) / entryPrice) * 100;
          const targetActualPct = ((targetPrice - entryPrice) / entryPrice) * 100;
          const usedOverride = entryEval.stopOverride != null || entryEval.targetOverride != null;
          const suffix = usedOverride ? " (structural levels from entry rule)" : "";
          return `${s.rules.side === "long" ? "Bought" : "Shorted"} ${qty} ${ticker} @ $${entryPrice.toFixed(2)} on strategy "${s.name}". Stop $${stopPrice.toFixed(2)} (${stopActualPct >= 0 ? "+" : ""}${stopActualPct.toFixed(2)}%), target $${targetPrice.toFixed(2)} (${targetActualPct >= 0 ? "+" : ""}${targetActualPct.toFixed(2)}%)${suffix}. Sized ${qty} units = ${accountRiskPct}% account risk ($${riskBudget.toFixed(0)}). Configured: SL ${stopLossPct}% / TP ${takeProfitPct}%.`;
        })(),
      });

      fired.push({
        strategyId: s.id,
        ticker,
        side: s.rules.side,
        price: entryPrice,
      });
    }
  }

  // Tick pulse: rate-limited pulse row showing what the brain is watching,
  // so the public page shows live activity between trades. Rate-limited to
  // ~once/hour OR fired immediately if any setup is within 20% of triggering
  // (so prospects see the AI getting close, not just routine heartbeats).
  if (fired.length === 0 && pulses.length > 0) {
    pulses.sort((a, b) => b.closenessPct - a.closenessPct);
    const topCloseness = pulses[0]?.closenessPct ?? 0;
    const NEAR_TRIGGER_PCT = 80;
    let shouldLog = topCloseness >= NEAR_TRIGGER_PCT;
    if (!shouldLog) {
      const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data: recent } = await sb
        .from("ai_decisions")
        .select("id")
        .eq("user_id", account.user_id)
        .eq("decision_type", "tick_pulse")
        .gte("created_at", hourAgo)
        .limit(1);
      shouldLog = (recent?.length ?? 0) === 0;
    }
    if (shouldLog) {
      const top = pulses.slice(0, 4);
      const summary = top
        .map(
          (p) =>
            `${p.strategy} → ${p.status} [${Math.round(p.closenessPct)}% to trigger]`,
        )
        .join(" · ");
      const watchCount = pulses.length;
      const headline =
        topCloseness >= NEAR_TRIGGER_PCT
          ? `Tick: ${watchCount} setup${watchCount === 1 ? "" : "s"} watched, top is CLOSE (${Math.round(topCloseness)}%).`
          : `Tick: watching ${watchCount} setup${watchCount === 1 ? "" : "s"}, none triggered.`;
      await logDecision(sb, account.user_id, {
        decision_type: "tick_pulse",
        inputs: { watching: pulses },
        output: { fired: 0, watched: watchCount, topCloseness },
        rationale: `${headline} ${summary}`,
      });
    }
  }

  return fired;
}

// Direction maps from a strategy's entry rule type to call vs put.
// Bullish rules → call; bearish rules → put. side: "short" is rejected
// upstream so this function only sees side: "long".
function optionDirectionFromRule(rule: EntryRule): "call" | "put" | null {
  switch (rule.type) {
    case "price_pop":
    case "breakout_above":
    case "ote_long":
    case "stdv_open_above":
    case "vwap_bounce_long":
    case "rsi_below": // oversold reversion = bullish entry
    case "ma_cross_up":
      return "call";
    case "price_drop":
    case "breakdown_below":
    case "ote_short":
    case "stdv_open_below":
    case "vwap_bounce_short":
    case "rsi_above": // overbought reversion = bearish entry
    case "ma_cross_down":
      return "put";
    default:
      return null;
  }
}

// Options entry handler. Replaces processEntries for AIs with
// instrumentMode === "options". The brain still proposes strategies on the
// underlying ticker — this handler maps directional triggers to long
// calls/puts, picks ATM next-weekly strike, sizes by premium, and stores
// the position with ticker = OCC contract symbol.
async function processOptionEntries(
  sb: Sb,
  account: AccountRow,
  slug: string,
): Promise<TickResult["entriesFired"]> {
  const fired: TickResult["entriesFired"] = [];
  type PulseEntry = { strategy: string; ticker: string; status: string; closenessPct: number };
  const pulses: PulseEntry[] = [];

  const { data: liveStrategies } = await sb
    .from("ai_strategies")
    .select(
      "id, name, hypothesis, instruments, rules, max_account_risk_pct, max_concurrent_positions, max_trades_per_day, status",
    )
    .eq("user_id", account.user_id)
    .eq("status", "live");
  const strategies = (liveStrategies ?? []) as StrategyRow[];
  if (strategies.length === 0) return fired;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const profileConfig = getAiProfileConfig(slug);
  const maxNotionalPct = profileConfig?.maxNotionalPctPerTrade ?? 0.30;
  const maxNotional = Number(account.starting_cash) * maxNotionalPct;

  for (const s of strategies) {
    const maxTradesPerDay = s.max_trades_per_day ?? 4;
    const { data: todayTrades } = await sb
      .from("trades")
      .select("id")
      .eq("ai_strategy_id", s.id)
      .gte("created_at", todayStart.toISOString());
    if ((todayTrades?.length ?? 0) >= maxTradesPerDay) continue;

    const { count: openCount } = await sb
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id);
    const maxConcurrent = s.max_concurrent_positions ?? 4;
    if ((openCount ?? 0) >= maxConcurrent) continue;

    // Option entries only honor side: "long" — short premium is off-limits.
    if (s.rules.side !== "long") continue;
    const optionType = optionDirectionFromRule(s.rules.entry);
    if (!optionType) continue;

    for (const underlying of s.instruments) {
      // Skip futures and option contracts as underlyings — must be a stock/ETF
      if (underlying.includes("=F") || /\d{6}[CP]\d{8}/.test(underlying)) continue;

      let candles;
      try {
        candles = await getCandles(underlying, CANDLE_RANGE);
      } catch {
        continue;
      }
      if (!candles || candles.length < 50) continue;

      const lastCandle = candles[candles.length - 1];
      if (s.rules.time_window_utc) {
        const hr = new Date(lastCandle.time * 1000).getUTCHours();
        if (hr < s.rules.time_window_utc[0] || hr >= s.rules.time_window_utc[1]) continue;
      }

      const entryEval = evalEntryLastCandle(s.rules.entry, candles);
      if (!entryEval.hit) {
        // Reuse the same describe util via a tiny wrapper — we don't have it
        // exported, so just push a minimal pulse entry here.
        pulses.push({
          strategy: s.name,
          ticker: underlying,
          status: `${underlying} ${s.rules.entry.type} watched (options)`,
          closenessPct: 0,
        });
        continue;
      }

      // Don't double-enter — skip if we already opened a contract on this
      // strategy in the last hour.
      const sixtyMinAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count: recentCount } = await sb
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("ai_strategy_id", s.id)
        .gte("created_at", sixtyMinAgo);
      if ((recentCount ?? 0) > 0) continue;

      // Fetch chain, pick expiration + strike
      const chain = await getOptionsChain(underlying);
      if (!chain || chain.expirationDates.length === 0) continue;
      const expiration = pickExpiration(chain.expirationDates, 3);
      if (!expiration) continue;
      const k = Math.floor(new Date(expiration).getTime() / 1000);
      const slot = chain.byExpiration[k];
      if (!slot) continue;
      const contractsList = optionType === "call" ? slot.calls : slot.puts;
      if (contractsList.length === 0) continue;
      const allStrikes = contractsList.map((c) => c.strike);
      const strike = pickAtmStrike(allStrikes, chain.underlyingPrice);
      if (strike == null) continue;
      const contract = contractsList.find((c) => Math.abs(c.strike - strike) < 0.01);
      if (!contract) continue;
      // Mid price preferred; fall back to last
      let premium = 0;
      if (contract.bid > 0 && contract.ask > 0) {
        premium = (contract.bid + contract.ask) / 2;
      } else {
        premium = contract.lastPrice;
      }
      if (premium <= 0) continue;

      const riskPct = s.max_account_risk_pct ?? 4.0;
      const riskBudget = (Number(account.starting_cash) * riskPct) / 100;
      // For long calls/puts, max loss per contract = premium × multiplier.
      // contracts = floor(riskBudget / max_loss_per_contract)
      const maxLossPerContract = premium * OPTION_CONTRACT_MULTIPLIER;
      let qty = Math.floor(riskBudget / maxLossPerContract);
      if (qty < 1) continue;

      // Notional cap
      let cashRequired = qty * premium * OPTION_CONTRACT_MULTIPLIER;
      if (cashRequired > maxNotional) {
        qty = Math.floor(maxNotional / (premium * OPTION_CONTRACT_MULTIPLIER));
        if (qty < 1) continue;
        cashRequired = qty * premium * OPTION_CONTRACT_MULTIPLIER;
      }
      if (cashRequired > Number(account.cash)) continue;

      // Premium stop / target levels
      const stopPct = s.rules.exit.stop_loss_pct;
      const targetPct = s.rules.exit.take_profit_pct;
      const stopPremium = premium * (1 - stopPct / 100);
      const targetPremium = premium * (1 + targetPct / 100);
      if (stopPremium >= premium || targetPremium <= premium) continue; // sanity

      await sb.from("positions").insert({
        account_id: account.id,
        ticker: contract.contractSymbol,
        shares: qty,
        avg_cost: premium,
        stop_loss: stopPremium,
        take_profit: targetPremium,
        side: "long",
        instrument_type: "option",
        margin_held: 0,
      });

      const total = qty * premium * OPTION_CONTRACT_MULTIPLIER;
      const { data: tradeRow } = await sb
        .from("trades")
        .insert({
          account_id: account.id,
          ticker: contract.contractSymbol,
          side: "buy",
          shares: qty,
          price: premium,
          total,
          notes: `AI ${optionType.toUpperCase()}: ${s.name} · ${underlying} ${strike} exp ${new Date(expiration).toISOString().slice(0, 10)}`,
          triggered_by: "manual",
          ai_strategy_id: s.id,
          instrument_type: "option",
          contracts: qty,
          point_value: null,
        })
        .select("id")
        .single();

      await sb
        .from("accounts")
        .update({ cash: Number(account.cash) - cashRequired })
        .eq("id", account.id);
      account.cash = Number(account.cash) - cashRequired;

      await sb
        .from("ai_strategies")
        .update({ last_signal_at: new Date().toISOString() })
        .eq("id", s.id);

      await logDecision(sb, account.user_id, {
        strategy_id: s.id,
        trade_id: (tradeRow as { id: string } | null)?.id ?? null,
        decision_type: "trade_filled",
        inputs: {
          underlying,
          contract_symbol: contract.contractSymbol,
          option_type: optionType,
          strike,
          expiration: expiration.toISOString(),
          entry_premium: premium,
          contracts: qty,
          stop_premium: stopPremium,
          target_premium: targetPremium,
          condition: s.rules.entry,
        },
        output: { success: true },
        rationale: `Bought ${qty} ${underlying} $${strike} ${optionType.toUpperCase()} exp ${new Date(expiration).toISOString().slice(0, 10)} @ $${premium.toFixed(2)} premium (strategy "${s.name}"). Premium stop $${stopPremium.toFixed(2)} (-${stopPct}%), premium target $${targetPremium.toFixed(2)} (+${targetPct}%). ${qty} contracts × $${premium.toFixed(2)} × 100 = $${total.toFixed(2)} max loss. ${riskPct}% account risk budget = $${riskBudget.toFixed(0)}.`,
      });

      fired.push({
        strategyId: s.id,
        ticker: contract.contractSymbol,
        side: "long",
        price: premium,
      });
    }
  }

  // Same tick-pulse pattern as stock entries, simplified.
  if (fired.length === 0 && pulses.length > 0) {
    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: recent } = await sb
      .from("ai_decisions")
      .select("id")
      .eq("user_id", account.user_id)
      .eq("decision_type", "tick_pulse")
      .gte("created_at", hourAgo)
      .limit(1);
    if ((recent?.length ?? 0) === 0) {
      await logDecision(sb, account.user_id, {
        decision_type: "tick_pulse",
        inputs: { watching: pulses },
        output: { fired: 0, watched: pulses.length },
        rationale: `Tick (options): watching ${pulses.length} setup${pulses.length === 1 ? "" : "s"}, none triggered.`,
      });
    }
  }

  return fired;
}

// Options exits — mark-to-market each open option position via a fresh chain
// fetch, compare current premium against stop/target levels, close on hit
// or 1 day before expiration. Cash credited back is current_premium ×
// contracts × 100; realized P&L is (exit_premium - entry_premium) × contracts × 100.
async function processOptionExits(
  sb: Sb,
  account: AccountRow,
): Promise<TickResult["exitsClosed"]> {
  const closed: TickResult["exitsClosed"] = [];
  const { data: positions } = await sb
    .from("positions")
    .select("id, account_id, ticker, shares, avg_cost, side, stop_loss, take_profit, opened_at, instrument_type, margin_held")
    .eq("account_id", account.id)
    .eq("instrument_type", "option");
  const list = (positions ?? []) as PositionRow[];
  if (list.length === 0) return closed;

  for (const pos of list) {
    const parsed = parseOptionSymbol(pos.ticker);
    if (!parsed) continue;

    // Resolve seeding strategy for the post-trade review later
    const { data: trades } = await sb
      .from("trades")
      .select("id, ai_strategy_id, created_at")
      .eq("account_id", account.id)
      .eq("ticker", pos.ticker)
      .eq("side", "buy")
      .order("created_at", { ascending: false })
      .limit(1);
    const seed = (trades?.[0] ?? null) as { id: string; ai_strategy_id: string | null; created_at: string } | null;

    const currentPremium = await getOptionMidPrice(
      parsed.underlying,
      parsed.expiration,
      parsed.strike,
      parsed.optionType,
    );

    // Time exit: 1 day before expiration regardless of premium level
    const oneDayBeforeExp = parsed.expiration.getTime() - 24 * 60 * 60_000;
    const isTimeExit = Date.now() >= oneDayBeforeExp;

    let reason: "stop" | "target" | "time_exit" | null = null;
    let exitPremium = currentPremium ?? Number(pos.avg_cost);
    if (currentPremium != null) {
      if (pos.stop_loss != null && currentPremium <= Number(pos.stop_loss)) reason = "stop";
      else if (pos.take_profit != null && currentPremium >= Number(pos.take_profit)) reason = "target";
    }
    if (!reason && isTimeExit) {
      reason = "time_exit";
      // On time exit, if we have no mid (rare expired/very near expiration),
      // assume worst-case 0 to be conservative.
      if (currentPremium == null) exitPremium = 0;
    }
    if (!reason) continue;

    const entryPremium = Number(pos.avg_cost);
    const qty = Number(pos.shares);
    const pnl = (exitPremium - entryPremium) * qty * OPTION_CONTRACT_MULTIPLIER;
    const cashCredited = exitPremium * qty * OPTION_CONTRACT_MULTIPLIER;

    // Close trade
    await sb.from("trades").insert({
      account_id: account.id,
      ticker: pos.ticker,
      side: "sell",
      shares: qty,
      price: exitPremium,
      total: cashCredited,
      realized_pnl: pnl,
      triggered_by: reason,
      ai_strategy_id: seed?.ai_strategy_id ?? null,
      instrument_type: "option",
      contracts: qty,
      point_value: null,
      exited_at: new Date().toISOString(),
    });

    // Refresh seeding trade with exited_at + realized_pnl summary
    if (seed?.id) {
      await sb
        .from("trades")
        .update({ exited_at: new Date().toISOString(), realized_pnl: pnl })
        .eq("id", seed.id);
    }

    await sb.from("positions").delete().eq("id", pos.id);
    await sb
      .from("accounts")
      .update({ cash: Number(account.cash) + cashCredited })
      .eq("id", account.id);
    account.cash = Number(account.cash) + cashCredited;

    await logDecision(sb, account.user_id, {
      strategy_id: seed?.ai_strategy_id ?? null,
      decision_type: "trade_exited",
      inputs: {
        contract_symbol: pos.ticker,
        underlying: parsed.underlying,
        strike: parsed.strike,
        option_type: parsed.optionType,
        expiration: parsed.expiration.toISOString(),
        exit_premium: exitPremium,
        reason,
      },
      output: { realized_pnl: pnl },
      rationale: `Closed ${qty} ${parsed.underlying} $${parsed.strike} ${parsed.optionType.toUpperCase()} @ $${exitPremium.toFixed(2)} premium — ${reason === "stop" ? "premium stop hit" : reason === "target" ? "premium target hit" : "time exit (1 day before expiration)"}. Entry premium $${entryPremium.toFixed(2)}, P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`,
    });

    closed.push({ ticker: pos.ticker, reason, price: exitPremium, pnl });
  }

  return closed;
}

// Run a single AI's tick — used both by the per-slug path and by the
// run-all-AIs loop below. Errors are captured so one failing AI doesn't
// blow up the others.
async function runTickForProfile(
  sb: Sb,
  slug: string,
  out: TickResult,
): Promise<void> {
  const profile = await getAiTraderProfile(slug);
  if (!profile?.id) {
    out.errors.push(`[${slug}] profile not found — run /api/admin/init-ai-trader`);
    return;
  }
  if (!profile.active_account_id) {
    out.errors.push(`[${slug}] no active account`);
    return;
  }

  const { data: acctRow } = await sb
    .from("accounts")
    .select("id, user_id, cash, starting_cash, status")
    .eq("id", profile.active_account_id)
    .single();
  if (!acctRow) {
    out.errors.push(`[${slug}] account not found`);
    return;
  }
  const account = acctRow as AccountRow;
  if (account.status !== "active") {
    out.errors.push(`[${slug}] status is ${account.status}`);
    return;
  }

  try {
    const profileCfg = getAiProfileConfig(slug);
    const useOptions = profileCfg?.instrumentMode === "options";
    const exits = useOptions
      ? await processOptionExits(sb, account)
      : await processExits(sb, account);
    const entries = useOptions
      ? await processOptionEntries(sb, account, slug)
      : await processEntries(sb, account, slug);
    out.exitsClosed.push(...exits);
    out.entriesFired.push(...entries);
    if (exits.length > 0 || entries.length > 0) {
      await snapshotEquity(sb, account.id);
    }

    // Auto-restart: profiles that opt in (resetAtCashPct set) get wiped and
    // restarted when cash drops below threshold AND no positions are open.
    // Each blowup is logged so the public page tracks the full survivorship-
    // free record.
    const config = getAiProfileConfig(slug);
    if (config?.resetAtCashPct != null) {
      const { data: freshAcct } = await sb
        .from("accounts")
        .select("id, cash, starting_cash")
        .eq("id", account.id)
        .single();
      const fresh = (freshAcct as { id: string; cash: number; starting_cash: number } | null);
      if (fresh) {
        const threshold = Number(fresh.starting_cash) * config.resetAtCashPct;
        const { count: openPos } = await sb
          .from("positions")
          .select("id", { count: "exact", head: true })
          .eq("account_id", fresh.id);
        if (Number(fresh.cash) < threshold && (openPos ?? 0) === 0) {
          // Count prior resets for the reset number
          const { count: priorResets } = await sb
            .from("ai_decisions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", account.user_id)
            .eq("decision_type", "account_reset");
          const resetNumber = (priorResets ?? 0) + 1;
          const finalCash = Number(fresh.cash);
          const drawdownPct =
            ((finalCash - Number(fresh.starting_cash)) / Number(fresh.starting_cash)) *
            100;

          // Wipe the account back to starting cash
          await sb
            .from("accounts")
            .update({
              cash: Number(fresh.starting_cash),
              high_water_mark: Number(fresh.starting_cash),
              status: "active",
            })
            .eq("id", fresh.id);

          // Archive any live/proposed strategies so the next research run
          // gives the rebooted AI a clean slate.
          await sb
            .from("ai_strategies")
            .update({
              status: "archived",
              paused_reason: `blowup #${resetNumber} reset`,
              paused_at: new Date().toISOString(),
            })
            .eq("user_id", account.user_id)
            .in("status", ["live", "proposed"]);

          await logDecision(sb, account.user_id, {
            decision_type: "account_reset",
            inputs: {
              reset_number: resetNumber,
              ending_cash: finalCash,
              starting_cash: Number(fresh.starting_cash),
              drawdown_pct: drawdownPct,
              threshold_pct: config.resetAtCashPct * 100,
            },
            output: { reset_to: Number(fresh.starting_cash) },
            rationale: `BLOWUP #${resetNumber}. Account fell to $${finalCash.toFixed(2)} (${drawdownPct.toFixed(2)}% from start), below the ${(config.resetAtCashPct * 100).toFixed(0)}% reset threshold. Wiped strategies, reset cash to $${Number(fresh.starting_cash).toFixed(0)}. Next research cycle will start a fresh run.`,
          });

          // Reflect the cash change in the in-memory account so subsequent
          // operations in this tick see the post-reset state.
          account.cash = Number(fresh.starting_cash);
        }
      }
    }
  } catch (e) {
    out.errors.push(`[${slug}] ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Run a tick for every AI profile in the roster. This is what the cron
// endpoint calls each ~10 minutes during market hours.
export async function runAiTraderTick(): Promise<TickResult> {
  const out: TickResult = { entriesFired: [], exitsClosed: [], errors: [] };
  const sb = adminClient();
  const all = await getAllAiTraderProfiles();
  for (const { config, profile } of all) {
    if (!profile) {
      out.errors.push(`[${config.slug}] not bootstrapped`);
      continue;
    }
    await runTickForProfile(sb, config.slug, out);
  }
  return out;
}

const _barsPerHourReserved = BARS_PER_HOUR; // referenced for future use
void _barsPerHourReserved;
