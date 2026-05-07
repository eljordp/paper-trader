"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { TIERS, type Tier, computeEvalStatus, nextTier } from "@/lib/tiers";
import { getQuote, getQuotes } from "@/lib/yahoo";
import { redirect } from "next/navigation";
import { todayUtcDate, type ChallengeType } from "@/lib/challenges";

const TIER_ORDER: Tier[] = ["rookie", "phase1", "phase2", "pro", "elite"];

async function requireUser() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { sb, user };
}

async function requireAccount(accountId: string) {
  const { sb, user } = await requireUser();
  const { data, error } = await sb
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("Account not found");
  return { sb, user, account: data };
}

async function markChallenge(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  matchType: ChallengeType,
  outcome: "completed" | "failed"
) {
  const today = todayUtcDate();
  const { data } = await sb
    .from("daily_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("challenge_date", today)
    .maybeSingle();
  if (!data) return;
  const c = data as {
    id: string;
    challenge_type: ChallengeType;
    completed: boolean;
    failed: boolean;
  };
  if (c.challenge_type !== matchType || c.completed || c.failed) return;
  const update: Record<string, unknown> =
    outcome === "completed"
      ? { completed: true, completed_at: new Date().toISOString() }
      : { failed: true, failed_at: new Date().toISOString() };
  await sb.from("daily_challenges").update(update).eq("id", c.id);
}

async function snapshotEquity(
  sb: Awaited<ReturnType<typeof createClient>>,
  accountId: string
) {
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
  const tickers = (positions ?? []).map((p) => (p as { ticker: string }).ticker);
  let positionsValue = 0;
  if (tickers.length > 0) {
    const quotes = await getQuotes(tickers);
    positionsValue = (positions ?? []).reduce((acc, p) => {
      const r = p as { ticker: string; shares: number; avg_cost: number; side: "long" | "short" };
      const px = quotes[r.ticker]?.price ?? Number(r.avg_cost);
      const v = Number(r.shares) * px;
      return r.side === "short" ? acc - v : acc + v;
    }, 0);
  }
  const cash = Number((account as { cash: number }).cash);
  const equity = cash + positionsValue;
  await sb.from("equity_snapshots").insert({
    account_id: accountId,
    cash,
    positions_value: positionsValue,
    equity,
  });
}

type AccountRow = {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  cash: number;
  starting_cash: number;
  high_water_mark: number;
  trading_days_count: number;
  last_trading_date: string | null;
  daily_loss_limit_pct: number | null;
  profit_target_pct: number | null;
  max_drawdown_pct: number | null;
  min_trading_days: number | null;
};

async function applySell(opts: {
  sb: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  account: AccountRow;
  ticker: string;
  qty: number;
  price: number;
  triggeredBy: "manual" | "stop" | "target" | "eval_failed";
  notes?: string;
  strategyId?: string | null;
  isTraining?: boolean;
}) {
  const { sb, user, account, ticker, qty, price, triggeredBy } = opts;

  const { data: pos } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", account.id)
    .eq("ticker", ticker)
    .maybeSingle();
  if (!pos) throw new Error(`No position in ${ticker}`);
  const position = pos as { shares: number; avg_cost: number; side: "long" | "short" };
  if (position.side !== "long") {
    throw new Error(`${ticker} is a short position — use Cover, not Sell`);
  }
  if (qty > Number(position.shares) + 1e-6) {
    throw new Error(`Only have ${position.shares} shares`);
  }

  const proceeds = qty * price;
  const realizedPnl = qty * (price - Number(position.avg_cost));
  const remainShares = Number(position.shares) - qty;

  if (remainShares < 1e-6) {
    await sb.from("positions").delete().eq("account_id", account.id).eq("ticker", ticker);
  } else {
    await sb
      .from("positions")
      .update({ shares: remainShares })
      .eq("account_id", account.id)
      .eq("ticker", ticker);
  }

  await sb.from("trades").insert({
    account_id: account.id,
    ticker,
    side: "sell",
    shares: qty,
    price,
    total: proceeds,
    realized_pnl: realizedPnl,
    triggered_by: triggeredBy,
    notes: opts.notes ?? null,
    strategy_id: opts.strategyId ?? null,
    is_training: opts.isTraining ?? false,
  });

  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = account.last_trading_date !== today;
  const newCash = Number(account.cash) + proceeds;

  // Compute new equity for HWM + eval check
  const { data: remainingPositions } = await sb
    .from("positions")
    .select("ticker, shares, avg_cost")
    .eq("account_id", account.id);
  const remTickers = (remainingPositions ?? []).map((r) => (r as { ticker: string }).ticker);
  let positionsValue = 0;
  if (remTickers.length > 0) {
    const quotes = await getQuotes(remTickers);
    positionsValue = (remainingPositions ?? []).reduce((acc, p) => {
      const r = p as { ticker: string; shares: number; avg_cost: number };
      const px = quotes[r.ticker]?.price ?? Number(r.avg_cost);
      return acc + Number(r.shares) * px;
    }, 0);
  }
  const newEquity = newCash + positionsValue;
  const newHWM = Math.max(Number(account.high_water_mark), newEquity);

  // Yesterday's close for daily loss check
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: snap } = await sb
    .from("equity_snapshots")
    .select("equity")
    .eq("account_id", account.id)
    .lt("recorded_at", todayStart.toISOString())
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const yesterdayClose = snap ? Number((snap as { equity: number }).equity) : null;

  const evalStatus = computeEvalStatus({
    tier: account.tier as Tier,
    startingCash: Number(account.starting_cash),
    currentEquity: newEquity,
    highWaterMark: newHWM,
    tradingDays: isNewDay ? Number(account.trading_days_count) + 1 : Number(account.trading_days_count),
    yesterdayClose,
  });

  const updates: Record<string, unknown> = {
    cash: newCash,
    high_water_mark: newHWM,
    last_trading_date: today,
    trading_days_count: isNewDay
      ? Number(account.trading_days_count) + 1
      : account.trading_days_count,
  };

  let unlockedTier: Tier | null = null;
  if (evalStatus.status === "passed") {
    updates.status = "passed";
    updates.passed_at = new Date().toISOString();
    const nt = nextTier(account.tier as Tier);
    if (nt) {
      const { data: profile } = await sb
        .from("profiles")
        .select("highest_tier_unlocked")
        .eq("id", user.id)
        .single();
      const currentHighest =
        (profile as { highest_tier_unlocked: Tier } | null)?.highest_tier_unlocked ?? "rookie";
      if (TIER_ORDER.indexOf(nt) > TIER_ORDER.indexOf(currentHighest)) {
        await sb.from("profiles").update({ highest_tier_unlocked: nt }).eq("id", user.id);
        unlockedTier = nt;
      }
    }
  } else if (evalStatus.status === "failed") {
    updates.status = "failed";
    updates.failed_at = new Date().toISOString();
    updates.failure_reason = evalStatus.failureReason ?? null;
  }

  // Cooldown after stop-out (not manual losses — only when their stop fires)
  if (opts.triggeredBy === "stop") {
    const { data: profile } = await sb
      .from("profiles")
      .select("cooldown_minutes")
      .eq("id", user.id)
      .single();
    const minutes = (profile as { cooldown_minutes: number | null } | null)?.cooldown_minutes ?? 15;
    if (minutes > 0) {
      updates.cooldown_until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    }
  }

  await sb.from("accounts").update(updates).eq("id", account.id);
  await sb.from("equity_snapshots").insert({
    account_id: account.id,
    cash: newCash,
    positions_value: positionsValue,
    equity: newEquity,
  });

  return { realizedPnl, evalStatus, unlockedTier };
}

export async function buy(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const qty = Number(formData.get("qty"));
  const stopLossRaw = formData.get("stopLoss");
  const takeProfitRaw = formData.get("takeProfit");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const strategyId = String(formData.get("strategyId") ?? "").trim() || null;
  const isTraining = formData.get("isTraining") === "true";
  const stopLoss = stopLossRaw ? Number(stopLossRaw) : null;
  const takeProfit = takeProfitRaw ? Number(takeProfitRaw) : null;

  if (!accountId || !ticker || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Invalid input" };
  }

  const { sb, user, account } = await requireAccount(accountId);

  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }

  // Cooldown check
  if (account.cooldown_until && new Date(account.cooldown_until).getTime() > Date.now()) {
    const remaining = Math.ceil(
      (new Date(account.cooldown_until).getTime() - Date.now()) / 60000
    );
    return { error: `Cooldown active — ${remaining} min remaining. Take a breath.` };
  }

  const quote = await getQuote(ticker).catch(() => null);
  if (!quote || !quote.price) return { error: `Couldn't get a price for ${ticker}` };

  // Validate SL/TP relative to entry
  if (stopLoss != null && stopLoss >= quote.price) {
    return { error: `Stop loss must be below the current price ($${quote.price.toFixed(2)})` };
  }
  if (takeProfit != null && takeProfit <= quote.price) {
    return { error: `Take profit must be above the current price ($${quote.price.toFixed(2)})` };
  }

  const total = qty * quote.price;
  if (total > Number(account.cash) + 1e-6) {
    return { error: `Need $${total.toFixed(2)} but you have $${Number(account.cash).toFixed(2)}` };
  }

  // Daily loss check
  if (account.daily_loss_limit_pct != null) {
    const limit = (Number(account.starting_cash) * Number(account.daily_loss_limit_pct)) / 100;
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayTrades } = await sb
      .from("trades")
      .select("realized_pnl")
      .eq("account_id", accountId)
      .gte("created_at", today);
    const todayRealized = (todayTrades ?? []).reduce(
      (acc: number, t) => acc + Number((t as { realized_pnl: number | null }).realized_pnl ?? 0),
      0
    );
    if (todayRealized < -limit) {
      return { error: `Daily loss limit hit (${account.daily_loss_limit_pct}%). Can't open new trades today.` };
    }
  }

  const { data: existing } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .maybeSingle();

  if (existing && (existing as { side: string }).side === "short") {
    return { error: `You're short ${ticker}. Cover first before going long.` };
  }

  if (existing) {
    const ex = existing as { shares: number; avg_cost: number };
    const newShares = Number(ex.shares) + qty;
    const newCost = (Number(ex.shares) * Number(ex.avg_cost) + qty * quote.price) / newShares;
    const update: Record<string, unknown> = { shares: newShares, avg_cost: newCost };
    if (stopLoss != null) update.stop_loss = stopLoss;
    if (takeProfit != null) update.take_profit = takeProfit;
    await sb
      .from("positions")
      .update(update)
      .eq("account_id", accountId)
      .eq("ticker", ticker);
  } else {
    await sb.from("positions").insert({
      account_id: accountId,
      ticker,
      shares: qty,
      avg_cost: quote.price,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      side: "long",
    });
  }

  await sb.from("trades").insert({
    account_id: accountId,
    ticker,
    side: "buy",
    shares: qty,
    price: quote.price,
    total,
    notes,
    triggered_by: "manual",
    strategy_id: strategyId,
    is_training: isTraining,
  });

  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = account.last_trading_date !== today;
  await sb
    .from("accounts")
    .update({
      cash: Number(account.cash) - total,
      last_trading_date: today,
      trading_days_count: isNewDay
        ? Number(account.trading_days_count) + 1
        : account.trading_days_count,
    })
    .eq("id", accountId);

  await snapshotEquity(sb, accountId);

  // Daily challenge tracking
  if (stopLoss != null) {
    await markChallenge(sb, user.id, "use_stop", "completed");
  }
  if (takeProfit != null) {
    await markChallenge(sb, user.id, "set_target", "completed");
  }

  revalidatePath("/", "layout");
  return { success: `Bought ${qty} ${ticker} @ $${quote.price.toFixed(2)}` };
}

export async function sell(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const qty = Number(formData.get("qty"));
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const strategyIdRaw = String(formData.get("strategyId") ?? "").trim();
  const strategyId = strategyIdRaw.length > 0 ? strategyIdRaw : null;
  const isTraining = formData.get("isTraining") === "true";

  if (!accountId || !ticker || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Invalid input" };
  }

  const { sb, user, account } = await requireAccount(accountId);

  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }

  const quote = await getQuote(ticker).catch(() => null);
  if (!quote || !quote.price) return { error: `Couldn't get a price for ${ticker}` };

  try {
    const result = await applySell({
      sb,
      user,
      account: account as AccountRow,
      ticker,
      qty,
      price: quote.price,
      triggeredBy: "manual",
      notes,
      strategyId,
      isTraining,
    });

    // Daily challenge: profitable_close
    if (result.realizedPnl > 0) {
      await markChallenge(sb, user.id, "profitable_close", "completed");
    }

    revalidatePath("/", "layout");
    if (result.evalStatus.status === "passed") {
      return {
        success: `🎯 Sold ${qty} ${ticker} @ $${quote.price.toFixed(2)} — eval PASSED${
          result.unlockedTier ? `! ${TIERS[result.unlockedTier].name} unlocked.` : "."
        }`,
      };
    }
    if (result.evalStatus.status === "failed") {
      return {
        error: `Sold ${qty} ${ticker} @ $${quote.price.toFixed(2)} — eval FAILED: ${result.evalStatus.failureReason}`,
      };
    }
    return {
      success: `Sold ${qty} ${ticker} @ $${quote.price.toFixed(2)} (${
        result.realizedPnl >= 0 ? "+" : ""
      }$${result.realizedPnl.toFixed(2)})`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sell failed" };
  }
}

// =============================================================================
// SHORT SELLING — open and cover
// =============================================================================

export async function shortOpen(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const qty = Number(formData.get("qty"));
  const stopLossRaw = formData.get("stopLoss");
  const takeProfitRaw = formData.get("takeProfit");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const strategyId = String(formData.get("strategyId") ?? "").trim() || null;
  const isTraining = formData.get("isTraining") === "true";
  const stopLoss = stopLossRaw ? Number(stopLossRaw) : null;
  const takeProfit = takeProfitRaw ? Number(takeProfitRaw) : null;

  if (!accountId || !ticker || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Invalid input" };
  }

  const { sb, user, account } = await requireAccount(accountId);

  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }
  if (account.cooldown_until && new Date(account.cooldown_until).getTime() > Date.now()) {
    const remaining = Math.ceil(
      (new Date(account.cooldown_until).getTime() - Date.now()) / 60000
    );
    return { error: `Cooldown active — ${remaining} min remaining. Take a breath.` };
  }

  const quote = await getQuote(ticker).catch(() => null);
  if (!quote || !quote.price) return { error: `Couldn't get a price for ${ticker}` };

  // For shorts: stop must be ABOVE entry, target BELOW
  if (stopLoss != null && stopLoss <= quote.price) {
    return { error: `Stop loss must be above the current price ($${quote.price.toFixed(2)}) on a short` };
  }
  if (takeProfit != null && takeProfit >= quote.price) {
    return { error: `Take profit must be below the current price ($${quote.price.toFixed(2)}) on a short` };
  }

  const proceeds = qty * quote.price;
  // Margin requirement (simplified): need 50% buying power
  const marginRequired = proceeds * 0.5;
  if (marginRequired > Number(account.cash) + 1e-6) {
    return { error: `Need $${marginRequired.toFixed(2)} buying power to short (50% of $${proceeds.toFixed(2)})` };
  }

  const { data: existing } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .maybeSingle();

  if (existing && (existing as { side: string }).side === "long") {
    return { error: `You're long ${ticker}. Sell first before shorting.` };
  }

  if (existing) {
    const ex = existing as { shares: number; avg_cost: number };
    const newShares = Number(ex.shares) + qty;
    const newCost = (Number(ex.shares) * Number(ex.avg_cost) + qty * quote.price) / newShares;
    const update: Record<string, unknown> = { shares: newShares, avg_cost: newCost };
    if (stopLoss != null) update.stop_loss = stopLoss;
    if (takeProfit != null) update.take_profit = takeProfit;
    await sb
      .from("positions")
      .update(update)
      .eq("account_id", accountId)
      .eq("ticker", ticker);
  } else {
    await sb.from("positions").insert({
      account_id: accountId,
      ticker,
      shares: qty,
      avg_cost: quote.price,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      side: "short",
    });
  }

  await sb.from("trades").insert({
    account_id: accountId,
    ticker,
    side: "short",
    shares: qty,
    price: quote.price,
    total: proceeds,
    notes,
    triggered_by: "manual",
    strategy_id: strategyId,
    is_training: isTraining,
  });

  // Cash gets the proceeds; margin is implicitly held against the short
  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = account.last_trading_date !== today;
  await sb
    .from("accounts")
    .update({
      cash: Number(account.cash) + proceeds,
      last_trading_date: today,
      trading_days_count: isNewDay
        ? Number(account.trading_days_count) + 1
        : account.trading_days_count,
    })
    .eq("id", accountId);

  await snapshotEquity(sb, accountId);

  if (stopLoss != null) await markChallenge(sb, user.id, "use_stop", "completed");
  if (takeProfit != null) await markChallenge(sb, user.id, "set_target", "completed");

  revalidatePath("/", "layout");
  return { success: `Shorted ${qty} ${ticker} @ $${quote.price.toFixed(2)}` };
}

async function applyCover(opts: {
  sb: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  account: AccountRow;
  ticker: string;
  qty: number;
  price: number;
  triggeredBy: "manual" | "stop" | "target" | "eval_failed";
  notes?: string;
  strategyId?: string | null;
  isTraining?: boolean;
}) {
  const { sb, user, account, ticker, qty, price, triggeredBy } = opts;

  const { data: pos } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", account.id)
    .eq("ticker", ticker)
    .maybeSingle();
  if (!pos) throw new Error(`No short position in ${ticker}`);
  const position = pos as { shares: number; avg_cost: number; side: "long" | "short" };
  if (position.side !== "short") {
    throw new Error(`${ticker} is a long position — use Sell, not Cover`);
  }
  if (qty > Number(position.shares) + 1e-6) {
    throw new Error(`Only short ${position.shares} shares`);
  }

  const cost = qty * price;
  // Short P&L: profit when price falls (entry - cover)
  const realizedPnl = qty * (Number(position.avg_cost) - price);
  const remainShares = Number(position.shares) - qty;

  if (remainShares < 1e-6) {
    await sb.from("positions").delete().eq("account_id", account.id).eq("ticker", ticker);
  } else {
    await sb
      .from("positions")
      .update({ shares: remainShares })
      .eq("account_id", account.id)
      .eq("ticker", ticker);
  }

  await sb.from("trades").insert({
    account_id: account.id,
    ticker,
    side: "cover",
    shares: qty,
    price,
    total: cost,
    realized_pnl: realizedPnl,
    triggered_by: triggeredBy,
    notes: opts.notes ?? null,
    strategy_id: opts.strategyId ?? null,
    is_training: opts.isTraining ?? false,
  });

  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = account.last_trading_date !== today;
  const newCash = Number(account.cash) - cost;

  // Compute new equity (long contributes +shares*price, short contributes -shares*price)
  const { data: remainingPositions } = await sb
    .from("positions")
    .select("ticker, shares, avg_cost, side")
    .eq("account_id", account.id);
  const remTickers = (remainingPositions ?? []).map((r) => (r as { ticker: string }).ticker);
  let positionsValue = 0;
  if (remTickers.length > 0) {
    const quotes = await getQuotes(remTickers);
    positionsValue = (remainingPositions ?? []).reduce((acc, p) => {
      const r = p as { ticker: string; shares: number; avg_cost: number; side: "long" | "short" };
      const px = quotes[r.ticker]?.price ?? Number(r.avg_cost);
      const value = Number(r.shares) * px;
      return r.side === "short" ? acc - value : acc + value;
    }, 0);
  }
  // For shorts: short obligation reduces equity. We add the short's "credit" (avg_cost*shares received as cash, but we owe shares back)
  // The net effect: equity = cash - (short_shares * current_price)
  // Since cash already includes the proceeds, and positionsValue subtracts current short value, this works out.
  const shortCredit = (remainingPositions ?? []).reduce((acc, p) => {
    const r = p as { shares: number; avg_cost: number; side: "long" | "short" };
    return r.side === "short" ? acc + Number(r.shares) * Number(r.avg_cost) : acc;
  }, 0);
  const newEquity = newCash + positionsValue + shortCredit;
  const newHWM = Math.max(Number(account.high_water_mark), newEquity);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: snap } = await sb
    .from("equity_snapshots")
    .select("equity")
    .eq("account_id", account.id)
    .lt("recorded_at", todayStart.toISOString())
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const yesterdayClose = snap ? Number((snap as { equity: number }).equity) : null;

  const evalStatus = computeEvalStatus({
    tier: account.tier as Tier,
    startingCash: Number(account.starting_cash),
    currentEquity: newEquity,
    highWaterMark: newHWM,
    tradingDays: isNewDay ? Number(account.trading_days_count) + 1 : Number(account.trading_days_count),
    yesterdayClose,
  });

  const updates: Record<string, unknown> = {
    cash: newCash,
    high_water_mark: newHWM,
    last_trading_date: today,
    trading_days_count: isNewDay
      ? Number(account.trading_days_count) + 1
      : account.trading_days_count,
  };

  let unlockedTier: Tier | null = null;
  if (evalStatus.status === "passed") {
    updates.status = "passed";
    updates.passed_at = new Date().toISOString();
    const nt = nextTier(account.tier as Tier);
    if (nt) {
      const { data: profile } = await sb
        .from("profiles")
        .select("highest_tier_unlocked")
        .eq("id", user.id)
        .single();
      const currentHighest =
        (profile as { highest_tier_unlocked: Tier } | null)?.highest_tier_unlocked ?? "rookie";
      if (TIER_ORDER.indexOf(nt) > TIER_ORDER.indexOf(currentHighest)) {
        await sb.from("profiles").update({ highest_tier_unlocked: nt }).eq("id", user.id);
        unlockedTier = nt;
      }
    }
  } else if (evalStatus.status === "failed") {
    updates.status = "failed";
    updates.failed_at = new Date().toISOString();
    updates.failure_reason = evalStatus.failureReason ?? null;
  }

  if (opts.triggeredBy === "stop") {
    const { data: profile } = await sb
      .from("profiles")
      .select("cooldown_minutes")
      .eq("id", user.id)
      .single();
    const minutes = (profile as { cooldown_minutes: number | null } | null)?.cooldown_minutes ?? 15;
    if (minutes > 0) {
      updates.cooldown_until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    }
  }

  await sb.from("accounts").update(updates).eq("id", account.id);
  await sb.from("equity_snapshots").insert({
    account_id: account.id,
    cash: newCash,
    positions_value: positionsValue + shortCredit,
    equity: newEquity,
  });

  return { realizedPnl, evalStatus, unlockedTier };
}

export async function cover(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const qty = Number(formData.get("qty"));
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const strategyIdRaw = String(formData.get("strategyId") ?? "").trim();
  const strategyId = strategyIdRaw.length > 0 ? strategyIdRaw : null;
  const isTraining = formData.get("isTraining") === "true";

  if (!accountId || !ticker || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Invalid input" };
  }

  const { sb, user, account } = await requireAccount(accountId);
  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }

  const quote = await getQuote(ticker).catch(() => null);
  if (!quote || !quote.price) return { error: `Couldn't get a price for ${ticker}` };

  try {
    const result = await applyCover({
      sb,
      user,
      account: account as AccountRow,
      ticker,
      qty,
      price: quote.price,
      triggeredBy: "manual",
      notes,
      strategyId,
      isTraining,
    });

    if (result.realizedPnl > 0) {
      await markChallenge(sb, user.id, "profitable_close", "completed");
    }

    revalidatePath("/", "layout");
    if (result.evalStatus.status === "passed") {
      return {
        success: `🎯 Covered ${qty} ${ticker} @ $${quote.price.toFixed(2)} — eval PASSED${
          result.unlockedTier ? `! ${TIERS[result.unlockedTier].name} unlocked.` : "."
        }`,
      };
    }
    if (result.evalStatus.status === "failed") {
      return {
        error: `Covered ${qty} ${ticker} @ $${quote.price.toFixed(2)} — eval FAILED: ${result.evalStatus.failureReason}`,
      };
    }
    return {
      success: `Covered ${qty} ${ticker} @ $${quote.price.toFixed(2)} (${
        result.realizedPnl >= 0 ? "+" : ""
      }$${result.realizedPnl.toFixed(2)})`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cover failed" };
  }
}

// =============================================================================
// PENDING ORDERS — limit & stop entry orders
// =============================================================================

type OrderSide = "buy" | "sell" | "short" | "cover";
type OrderType = "limit" | "stop";

export async function createOrder(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const side = String(formData.get("side") ?? "") as OrderSide;
  const orderType = String(formData.get("orderType") ?? "") as OrderType;
  const qty = Number(formData.get("qty"));
  const triggerPriceRaw = formData.get("triggerPrice");
  const stopLossRaw = formData.get("stopLoss");
  const takeProfitRaw = formData.get("takeProfit");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const strategyId = String(formData.get("strategyId") ?? "").trim() || null;
  const isTraining = formData.get("isTraining") === "true";

  if (!accountId || !ticker || !["buy", "sell", "short", "cover"].includes(side)) {
    return { error: "Invalid input" };
  }
  if (!["limit", "stop"].includes(orderType)) return { error: "Invalid order type" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Invalid quantity" };
  const triggerPrice = triggerPriceRaw ? Number(triggerPriceRaw) : null;
  if (!Number.isFinite(triggerPrice) || (triggerPrice ?? 0) <= 0) {
    return { error: "Trigger price required" };
  }
  const stopLoss = stopLossRaw ? Number(stopLossRaw) : null;
  const takeProfit = takeProfitRaw ? Number(takeProfitRaw) : null;

  const { sb, user, account } = await requireAccount(accountId);
  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }

  const insert: Record<string, unknown> = {
    account_id: accountId,
    user_id: user.id,
    ticker,
    side,
    order_type: orderType,
    qty,
    notes,
    strategy_id: strategyId,
    is_training: isTraining,
    stop_loss: stopLoss,
    take_profit: takeProfit,
  };
  if (orderType === "limit") insert.limit_price = triggerPrice;
  else insert.stop_price = triggerPrice;

  const { data, error } = await sb
    .from("pending_orders")
    .insert(insert)
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return {
    success: `${orderType === "limit" ? "Limit" : "Stop"} ${side} order placed for ${qty} ${ticker} @ $${triggerPrice!.toFixed(2)}`,
    orderId: (data as { id: string }).id,
  };
}

export async function cancelOrder(orderId: string) {
  const { sb, user } = await requireUser();
  await sb
    .from("pending_orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "open");
  revalidatePath("/", "layout");
}

/**
 * Scan the active account's open orders, fire any whose trigger has been hit.
 * Called by client polling and (eventually) by Vercel Cron.
 */
export async function checkOrders(): Promise<{ filled: Array<{ ticker: string; side: string; price: number }> }> {
  const { sb, user } = await requireUser();
  const { data: profile } = await sb
    .from("profiles")
    .select("active_account_id")
    .eq("id", user.id)
    .single();
  const accountId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (!accountId) return { filled: [] };

  const { data: account } = await sb
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!account || account.status !== "active") return { filled: [] };

  const { data: openOrders } = await sb
    .from("pending_orders")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "open");
  if (!openOrders || openOrders.length === 0) return { filled: [] };

  // Expire any past expiry first
  const now = new Date();
  for (const o of openOrders as Array<{ id: string; expires_at: string | null }>) {
    if (o.expires_at && new Date(o.expires_at) < now) {
      await sb
        .from("pending_orders")
        .update({ status: "expired", canceled_at: now.toISOString() })
        .eq("id", o.id);
    }
  }

  const stillOpen = (openOrders as Array<{
    id: string;
    ticker: string;
    side: OrderSide;
    order_type: OrderType;
    qty: number;
    limit_price: number | null;
    stop_price: number | null;
    stop_loss: number | null;
    take_profit: number | null;
    notes: string | null;
    strategy_id: string | null;
    is_training: boolean;
    expires_at: string | null;
  }>).filter((o) => !o.expires_at || new Date(o.expires_at) >= now);
  if (stillOpen.length === 0) return { filled: [] };

  const tickers = Array.from(new Set(stillOpen.map((o) => o.ticker)));
  const quotes = await getQuotes(tickers);

  const filled: Array<{ ticker: string; side: string; price: number }> = [];

  for (const o of stillOpen) {
    const px = quotes[o.ticker]?.price;
    if (!Number.isFinite(px)) continue;

    let triggered = false;
    let fillPrice = px;
    if (o.order_type === "limit" && o.limit_price != null) {
      const lp = Number(o.limit_price);
      // Buy/cover limits trigger when price <= limit (fill at limit or better)
      // Sell/short limits trigger when price >= limit (fill at limit or better)
      if ((o.side === "buy" || o.side === "cover") && px <= lp) {
        triggered = true;
        fillPrice = Math.min(px, lp);
      } else if ((o.side === "sell" || o.side === "short") && px >= lp) {
        triggered = true;
        fillPrice = Math.max(px, lp);
      }
    } else if (o.order_type === "stop" && o.stop_price != null) {
      const sp = Number(o.stop_price);
      // Buy stop triggers when price >= stop (breakout)
      // Sell stop / short stop triggers when price <= stop (breakdown)
      // Cover stop triggers when price >= stop
      if ((o.side === "buy" || o.side === "cover") && px >= sp) {
        triggered = true;
        fillPrice = px;
      } else if ((o.side === "sell" || o.side === "short") && px <= sp) {
        triggered = true;
        fillPrice = px;
      }
    }

    if (!triggered) continue;

    // Build a FormData and call the corresponding action.
    // For closes (sell/cover), don't pass stop/target.
    const fd = new FormData();
    fd.set("accountId", accountId);
    fd.set("ticker", o.ticker);
    fd.set("qty", String(o.qty));
    if (o.notes) fd.set("notes", o.notes);
    if (o.strategy_id) fd.set("strategyId", o.strategy_id);
    if (o.is_training) fd.set("isTraining", "true");
    if (o.side === "buy" || o.side === "short") {
      if (o.stop_loss != null) fd.set("stopLoss", String(o.stop_loss));
      if (o.take_profit != null) fd.set("takeProfit", String(o.take_profit));
    }

    let result: { error?: string; success?: string } = {};
    try {
      if (o.side === "buy") result = await buy(fd);
      else if (o.side === "sell") result = await sell(fd);
      else if (o.side === "short") result = await shortOpen(fd);
      else if (o.side === "cover") result = await cover(fd);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : "Order fill failed" };
    }

    if (result.error) {
      await sb
        .from("pending_orders")
        .update({
          status: "rejected",
          rejection_reason: result.error,
          canceled_at: now.toISOString(),
        })
        .eq("id", o.id);
    } else {
      await sb
        .from("pending_orders")
        .update({
          status: "filled",
          fill_price: fillPrice,
          filled_at: now.toISOString(),
        })
        .eq("id", o.id);
      filled.push({ ticker: o.ticker, side: o.side, price: fillPrice });
    }
  }

  if (filled.length > 0) revalidatePath("/", "layout");
  return { filled };
}

export async function setBracket(formData: FormData) {
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const stopLossRaw = formData.get("stopLoss");
  const takeProfitRaw = formData.get("takeProfit");
  const stopLoss = stopLossRaw && String(stopLossRaw).length > 0 ? Number(stopLossRaw) : null;
  const takeProfit = takeProfitRaw && String(takeProfitRaw).length > 0 ? Number(takeProfitRaw) : null;

  const { sb, user } = await requireUser();
  const { data: profile } = await sb
    .from("profiles")
    .select("active_account_id")
    .eq("id", user.id)
    .single();
  const accountId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (!accountId) return { error: "No active account" };

  await sb
    .from("positions")
    .update({ stop_loss: stopLoss, take_profit: takeProfit })
    .eq("account_id", accountId)
    .eq("ticker", ticker);

  revalidatePath("/", "layout");
  return { success: "Bracket updated" };
}

export async function updateTradeNote(tradeId: string, note: string) {
  const { sb, user } = await requireUser();
  const trimmed = note.trim();
  await sb
    .from("trades")
    .update({ notes: trimmed.length > 0 ? trimmed : null })
    .eq("id", tradeId)
    .in(
      "account_id",
      (
        (await sb.from("accounts").select("id").eq("user_id", user.id)).data ?? []
      ).map((a) => (a as { id: string }).id)
    );
  revalidatePath("/", "layout");
}

/**
 * Scan active account positions for SL/TP triggers and auto-execute.
 * Called by client polling AND by Vercel Cron.
 */
export async function checkBrackets(): Promise<{ triggered: Array<{ ticker: string; reason: "stop" | "target"; price: number }> }> {
  const { sb, user } = await requireUser();
  const { data: profile } = await sb
    .from("profiles")
    .select("active_account_id")
    .eq("id", user.id)
    .single();
  const accountId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (!accountId) return { triggered: [] };

  const { data: account } = await sb
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!account || account.status !== "active") return { triggered: [] };

  const { data: positions } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", accountId);
  const withBrackets = (positions ?? []).filter(
    (p) => (p as { stop_loss: number | null; take_profit: number | null }).stop_loss != null ||
           (p as { stop_loss: number | null; take_profit: number | null }).take_profit != null
  );
  if (withBrackets.length === 0) return { triggered: [] };

  const tickers = withBrackets.map((p) => (p as { ticker: string }).ticker);
  const quotes = await getQuotes(tickers);

  const triggered: Array<{ ticker: string; reason: "stop" | "target"; price: number }> = [];

  for (const p of withBrackets) {
    const pos = p as { ticker: string; shares: number; stop_loss: number | null; take_profit: number | null };
    const px = quotes[pos.ticker]?.price;
    if (!Number.isFinite(px)) continue;

    let trigger: "stop" | "target" | null = null;
    if (pos.stop_loss != null && px <= Number(pos.stop_loss)) trigger = "stop";
    else if (pos.take_profit != null && px >= Number(pos.take_profit)) trigger = "target";

    if (trigger) {
      try {
        await applySell({
          sb,
          user,
          account: account as AccountRow,
          ticker: pos.ticker,
          qty: Number(pos.shares),
          price: px,
          triggeredBy: trigger,
        });
        triggered.push({ ticker: pos.ticker, reason: trigger, price: px });
      } catch {}
    }
  }

  if (triggered.length > 0) revalidatePath("/", "layout");
  return { triggered };
}

export async function toggleWatchlist(ticker: string) {
  const { sb, user } = await requireUser();
  const t = ticker.toUpperCase();
  const { data: existing } = await sb
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("ticker", t)
    .maybeSingle();
  if (existing) {
    await sb.from("watchlist").delete().eq("user_id", user.id).eq("ticker", t);
  } else {
    await sb.from("watchlist").insert({ user_id: user.id, ticker: t });
  }
  revalidatePath("/", "layout");
}

export async function createTierAccount(tier: Tier) {
  const { sb, user } = await requireUser();
  const cfg = TIERS[tier];

  const { data: profile } = await sb
    .from("profiles")
    .select("highest_tier_unlocked, plan, trial_until, pro_until")
    .eq("id", user.id)
    .single();
  const p = profile as {
    highest_tier_unlocked: Tier;
    plan: "free" | "pro" | "vip" | "enterprise";
    trial_until: string | null;
    pro_until: string | null;
  } | null;
  const highestUnlocked = p?.highest_tier_unlocked ?? "rookie";
  const { isTierUnlocked } = await import("@/lib/tiers");
  if (!isTierUnlocked(highestUnlocked, tier)) {
    throw new Error(`${cfg.name} not unlocked yet`);
  }
  // Plan-based gating
  const { effectivePlan, planForTier, PLANS } = await import("@/lib/plans");
  const userPlan = effectivePlan(p ?? {});
  const requiredPlan = planForTier(tier);
  if (
    PLANS[userPlan].unlockedTiers.indexOf(tier) === -1
  ) {
    throw new Error(
      `${cfg.name} requires ${PLANS[requiredPlan].name}. Upgrade at /pro.`
    );
  }

  const { data, error } = await sb
    .from("accounts")
    .insert({
      user_id: user.id,
      name: cfg.name,
      tier,
      starting_cash: cfg.startingCash,
      cash: cfg.startingCash,
      high_water_mark: cfg.startingCash,
      profit_target_pct: cfg.rules.profitTargetPct,
      daily_loss_limit_pct: cfg.rules.dailyLossLimitPct,
      max_drawdown_pct: cfg.rules.maxDrawdownPct,
      min_trading_days: cfg.rules.minTradingDays,
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from("profiles").update({ active_account_id: data.id }).eq("id", user.id);
  revalidatePath("/", "layout");
  return data;
}

export async function switchAccount(accountId: string) {
  const { sb, user } = await requireUser();
  await sb.from("profiles").update({ active_account_id: accountId }).eq("id", user.id);
  revalidatePath("/", "layout");
}

export async function resetActiveAccount() {
  const { sb, user } = await requireUser();
  const { data: profile } = await sb
    .from("profiles")
    .select("active_account_id")
    .eq("id", user.id)
    .single();
  const activeId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (!activeId) return;
  const { data: account } = await sb.from("accounts").select("*").eq("id", activeId).single();
  if (!account) return;

  await sb.from("positions").delete().eq("account_id", activeId);
  await sb.from("trades").delete().eq("account_id", activeId);
  await sb.from("equity_snapshots").delete().eq("account_id", activeId);
  await sb
    .from("accounts")
    .update({
      cash: Number(account.starting_cash),
      high_water_mark: Number(account.starting_cash),
      status: "active",
      failure_reason: null,
      passed_at: null,
      failed_at: null,
      trading_days_count: 0,
      last_trading_date: null,
    })
    .eq("id", activeId);
  revalidatePath("/", "layout");
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
