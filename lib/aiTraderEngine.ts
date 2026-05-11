import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/admin";
import { getCandles, getQuote } from "@/lib/yahoo";
import type { StrategyRules, EntryRule, EntryEval } from "@/lib/aiLab";
import { evalOteLong, evalOteShort, computeStdvOpenLevels, evalVwapBounceLong, evalVwapBounceShort } from "@/lib/aiLab";
import { getAiTraderProfile } from "@/lib/aiTrader";
import { getFuturesSpec, instrumentType, computeRealizedPnl, computeUnrealizedPnl } from "@/lib/instruments";

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
      return c.close > high && candles[i - 1].close <= high
        ? { hit: true }
        : { hit: false };
    }
    case "breakdown_below": {
      if (i < rule.lookback_bars) return { hit: false };
      let low = Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++)
        if (candles[j].low < low) low = candles[j].low;
      return c.close < low && candles[i - 1].close >= low
        ? { hit: true }
        : { hit: false };
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
    closed.push({ ticker: pos.ticker, reason, price: px, pnl });
  }

  return closed;
}

async function processEntries(
  sb: Sb,
  account: AccountRow,
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
        marginHeld = qty * futSpec.dayTradeMargin;
      } else {
        qty = Math.floor((riskBudget / stopDistance) * 100) / 100;
        if (qty <= 0) continue;
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

export async function runAiTraderTick(): Promise<TickResult> {
  const out: TickResult = { entriesFired: [], exitsClosed: [], errors: [] };
  const sb = adminClient();

  const profile = await getAiTraderProfile();
  if (!profile?.id) {
    out.errors.push("AI Trader profile not found — run /api/admin/init-ai-trader");
    return out;
  }
  if (!profile.active_account_id) {
    out.errors.push("AI Trader has no active account");
    return out;
  }

  const { data: acctRow } = await sb
    .from("accounts")
    .select("id, user_id, cash, starting_cash, status")
    .eq("id", profile.active_account_id)
    .single();
  if (!acctRow) {
    out.errors.push("AI Trader account not found");
    return out;
  }
  const account = acctRow as AccountRow;
  if (account.status !== "active") {
    out.errors.push(`Account status is ${account.status}`);
    return out;
  }

  try {
    out.exitsClosed = await processExits(sb, account);
    out.entriesFired = await processEntries(sb, account);
    if (out.exitsClosed.length > 0 || out.entriesFired.length > 0) {
      await snapshotEquity(sb, account.id);
    }
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e));
  }

  return out;
}

const _barsPerHourReserved = BARS_PER_HOUR; // referenced for future use
void _barsPerHourReserved;
