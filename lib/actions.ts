"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { TIERS, type Tier, computeEvalStatus, nextTier } from "@/lib/tiers";
import { getQuote } from "@/lib/yahoo";
import { redirect } from "next/navigation";

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

export async function buy(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const qty = Number(formData.get("qty"));

  if (!accountId || !ticker || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Invalid input" };
  }

  const { sb, user, account } = await requireAccount(accountId);

  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }

  const quote = await getQuote(ticker).catch(() => null);
  if (!quote || !quote.price) {
    return { error: `Couldn't get a price for ${ticker}` };
  }

  const total = qty * quote.price;
  if (total > Number(account.cash) + 1e-6) {
    return { error: `Need ${total.toFixed(2)} but you have ${Number(account.cash).toFixed(2)}` };
  }

  // Daily loss limit check
  if (account.daily_loss_limit_pct != null) {
    const limit = (Number(account.starting_cash) * Number(account.daily_loss_limit_pct)) / 100;
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayTrades } = await sb
      .from("trades")
      .select("realized_pnl, created_at")
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

  // Look up existing position
  const { data: existing } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .maybeSingle();

  if (existing) {
    const ex = existing as { shares: number; avg_cost: number };
    const newShares = Number(ex.shares) + qty;
    const newCost = (Number(ex.shares) * Number(ex.avg_cost) + qty * quote.price) / newShares;
    await sb
      .from("positions")
      .update({ shares: newShares, avg_cost: newCost })
      .eq("account_id", accountId)
      .eq("ticker", ticker);
  } else {
    await sb.from("positions").insert({
      account_id: accountId,
      ticker,
      shares: qty,
      avg_cost: quote.price,
    });
  }

  await sb.from("trades").insert({
    account_id: accountId,
    ticker,
    side: "buy",
    shares: qty,
    price: quote.price,
    total,
  });

  // Update account cash + trading day
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

  revalidatePath("/", "layout");
  return { success: `Bought ${qty} ${ticker} @ $${quote.price.toFixed(2)}` };
}

export async function sell(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const qty = Number(formData.get("qty"));

  if (!accountId || !ticker || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Invalid input" };
  }

  const { sb, user, account } = await requireAccount(accountId);

  if (account.status !== "active") {
    return { error: `Account is ${account.status}, can't trade` };
  }

  const { data: pos } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .maybeSingle();

  if (!pos) return { error: `No position in ${ticker}` };
  const position = pos as { shares: number; avg_cost: number };
  if (qty > Number(position.shares) + 1e-6) {
    return { error: `Only have ${position.shares} shares` };
  }

  const quote = await getQuote(ticker).catch(() => null);
  if (!quote || !quote.price) return { error: `Couldn't get a price for ${ticker}` };

  const proceeds = qty * quote.price;
  const realizedPnl = qty * (quote.price - Number(position.avg_cost));

  const remainShares = Number(position.shares) - qty;
  if (remainShares < 1e-6) {
    await sb
      .from("positions")
      .delete()
      .eq("account_id", accountId)
      .eq("ticker", ticker);
  } else {
    await sb
      .from("positions")
      .update({ shares: remainShares })
      .eq("account_id", accountId)
      .eq("ticker", ticker);
  }

  await sb.from("trades").insert({
    account_id: accountId,
    ticker,
    side: "sell",
    shares: qty,
    price: quote.price,
    total: proceeds,
    realized_pnl: realizedPnl,
  });

  // Update cash + check eval rules
  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = account.last_trading_date !== today;
  const newCash = Number(account.cash) + proceeds;

  // Compute new equity = cash + value of remaining positions
  const { data: remainingPositions } = await sb
    .from("positions")
    .select("*")
    .eq("account_id", accountId);
  const positionsValue = await computePositionsValue(remainingPositions ?? []);
  const newEquity = newCash + positionsValue;
  const newHWM = Math.max(Number(account.high_water_mark), newEquity);

  // Eval status
  const evalStatus = computeEvalStatus({
    tier: account.tier as Tier,
    startingCash: Number(account.starting_cash),
    currentEquity: newEquity,
    highWaterMark: newHWM,
    tradingDays: isNewDay
      ? Number(account.trading_days_count) + 1
      : Number(account.trading_days_count),
  });

  const updates: Record<string, unknown> = {
    cash: newCash,
    high_water_mark: newHWM,
    last_trading_date: today,
    trading_days_count: isNewDay
      ? Number(account.trading_days_count) + 1
      : account.trading_days_count,
  };

  if (evalStatus.status === "passed") {
    updates.status = "passed";
    updates.passed_at = new Date().toISOString();
    // Unlock next tier
    const nt = nextTier(account.tier as Tier);
    if (nt) {
      const { data: profile } = await sb
        .from("profiles")
        .select("highest_tier_unlocked")
        .eq("id", user.id)
        .single();
      const currentHighest = (profile as { highest_tier_unlocked: Tier } | null)?.highest_tier_unlocked ?? "rookie";
      const TIER_ORDER: Tier[] = ["rookie", "phase1", "phase2", "pro", "elite"];
      if (TIER_ORDER.indexOf(nt) > TIER_ORDER.indexOf(currentHighest)) {
        await sb.from("profiles").update({ highest_tier_unlocked: nt }).eq("id", user.id);
      }
    }
  } else if (evalStatus.status === "failed") {
    updates.status = "failed";
    updates.failed_at = new Date().toISOString();
    updates.failure_reason = evalStatus.failureReason ?? null;
  }

  await sb.from("accounts").update(updates).eq("id", accountId);

  revalidatePath("/", "layout");

  if (evalStatus.status === "passed") {
    return { success: `🎯 Sold ${qty} ${ticker} @ $${quote.price.toFixed(2)} — eval PASSED!` };
  }
  if (evalStatus.status === "failed") {
    return { error: `Sold ${qty} ${ticker} @ $${quote.price.toFixed(2)} — but eval FAILED: ${evalStatus.failureReason}` };
  }
  return { success: `Sold ${qty} ${ticker} @ $${quote.price.toFixed(2)} (${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)})` };
}

async function computePositionsValue(positions: Array<{ ticker: string; shares: number; avg_cost: number }>) {
  if (positions.length === 0) return 0;
  const tickers = positions.map((p) => p.ticker);
  const { getQuotes } = await import("@/lib/yahoo");
  const quotes = await getQuotes(tickers);
  return positions.reduce((acc, p) => {
    const px = quotes[p.ticker]?.price ?? Number(p.avg_cost);
    return acc + Number(p.shares) * px;
  }, 0);
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

  // Verify unlocked
  const { data: profile } = await sb
    .from("profiles")
    .select("highest_tier_unlocked")
    .eq("id", user.id)
    .single();
  const TIER_ORDER: Tier[] = ["rookie", "phase1", "phase2", "pro", "elite"];
  const highestUnlocked = (profile as { highest_tier_unlocked: Tier } | null)?.highest_tier_unlocked ?? "rookie";
  if (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(highestUnlocked)) {
    throw new Error(`${cfg.name} not unlocked yet`);
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
