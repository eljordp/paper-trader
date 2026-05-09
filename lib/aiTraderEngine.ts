import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/admin";
import { getCandles, getQuote } from "@/lib/yahoo";
import type { StrategyRules, EntryRule, EntryEval } from "@/lib/aiLab";
import { evalOteLong, evalOteShort, computeStdvOpenLevels, evalVwapBounceLong, evalVwapBounceShort } from "@/lib/aiLab";
import { getAiTraderProfile } from "@/lib/aiTrader";

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
    .select("ticker, shares, avg_cost, side")
    .eq("account_id", accountId);
  const list = (positions ?? []) as Array<{
    ticker: string;
    shares: number;
    avg_cost: number;
    side: "long" | "short";
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
      const v = Number(p.shares) * px;
      if (p.side === "short") {
        positionsValue -= v;
        shortCredit += Number(p.shares) * Number(p.avg_cost);
      } else {
        positionsValue += v;
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
  const realizedPnl = Number(pos.shares) * (price - Number(pos.avg_cost));
  const total = Number(pos.shares) * price;
  await sb.from("positions").delete().eq("id", pos.id);
  await sb.from("trades").insert({
    account_id: account.id,
    ticker: pos.ticker,
    side: "sell",
    shares: pos.shares,
    price,
    total,
    realized_pnl: realizedPnl,
    triggered_by: reason === "time_exit" ? "manual" : reason,
    ai_strategy_id: strategyId,
    notes: `AI auto-exit: ${reason}`,
  });
  await sb
    .from("accounts")
    .update({ cash: Number(account.cash) + total })
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
  const realizedPnl = Number(pos.shares) * (Number(pos.avg_cost) - price);
  const cost = Number(pos.shares) * price;
  await sb.from("positions").delete().eq("id", pos.id);
  await sb.from("trades").insert({
    account_id: account.id,
    ticker: pos.ticker,
    side: "cover",
    shares: pos.shares,
    price,
    total: cost,
    realized_pnl: realizedPnl,
    triggered_by: reason === "time_exit" ? "manual" : reason,
    ai_strategy_id: strategyId,
    notes: `AI auto-exit: ${reason}`,
  });
  await sb
    .from("accounts")
    .update({ cash: Number(account.cash) - cost })
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
    .select("id, account_id, ticker, shares, avg_cost, side, stop_loss, take_profit, opened_at")
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
      // Skip futures — engine is stocks-only for the always-on AI Trader
      if (ticker.includes("=F")) continue;

      let candles;
      try {
        candles = await getCandles(ticker, CANDLE_RANGE);
      } catch {
        continue;
      }
      if (!candles || candles.length < 50) continue;

      const lastCandle = candles[candles.length - 1];
      if (s.rules.time_window_utc) {
        const hr = new Date(lastCandle.time * 1000).getUTCHours();
        if (
          hr < s.rules.time_window_utc[0] ||
          hr >= s.rules.time_window_utc[1]
        )
          continue;
      }

      const entryEval = evalEntryLastCandle(s.rules.entry, candles);
      if (!entryEval.hit) continue;

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
      const qty = Math.floor((riskBudget / stopDistance) * 100) / 100;
      if (qty <= 0) continue;

      // Cash check
      const cashRequired =
        s.rules.side === "long"
          ? qty * entryPrice
          : qty * entryPrice * 0.5; // 50% margin for shorts
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
        instrument_type: "stock",
        margin_held: 0,
      });

      // Insert trade
      const tradeSide = s.rules.side === "long" ? "buy" : "short";
      const total =
        s.rules.side === "long" ? qty * entryPrice : qty * entryPrice;
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
          instrument_type: "stock",
        })
        .select("id")
        .single();

      // Update cash
      const cashDelta =
        s.rules.side === "long" ? -qty * entryPrice : qty * entryPrice; // short receives proceeds
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
