"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tier } from "@/lib/tiers";
import { TIERS } from "@/lib/tiers";

export type DBAccount = {
  id: string;
  user_id: string;
  name: string;
  tier: Tier;
  starting_cash: number;
  cash: number;
  status: "active" | "passed" | "failed";
  failure_reason: string | null;
  profit_target_pct: number | null;
  daily_loss_limit_pct: number | null;
  max_drawdown_pct: number | null;
  min_trading_days: number | null;
  high_water_mark: number;
  trading_days_count: number;
  last_trading_date: string | null;
  passed_at: string | null;
  failed_at: string | null;
  cooldown_until: string | null;
  firm_profile: string | null;
  drawdown_type: "static" | "trailing" | null;
  consistency_rule_pct: number | null;
  no_overnight: boolean | null;
  profit_target_dollars: number | null;
  daily_loss_limit_dollars: number | null;
  max_drawdown_dollars: number | null;
  trailing_dd_lock_at_dollars: number | null;
  created_at: string;
};

export type DBPosition = {
  id: string;
  account_id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  opened_at: string;
  stop_loss: number | null;
  take_profit: number | null;
  side: "long" | "short";
  instrument_type: "stock" | "futures";
  margin_held: number | null;
};

export type DBTrade = {
  id: string;
  account_id: string;
  ticker: string;
  side: "buy" | "sell" | "short" | "cover";
  shares: number;
  price: number;
  total: number;
  realized_pnl: number | null;
  notes: string | null;
  tags: string[] | null;
  triggered_by: "manual" | "stop" | "target" | "eval_failed" | null;
  review: {
    score: number;
    verdict: "textbook" | "good" | "decent" | "poor" | "bad";
    headline: string;
    whatRight: string[];
    whatWrong: string[];
    keyLesson: string;
  } | null;
  review_at: string | null;
  created_at: string;
};

export type DBPendingOrder = {
  id: string;
  account_id: string;
  user_id: string;
  ticker: string;
  side: "buy" | "sell" | "short" | "cover";
  order_type: "limit" | "stop";
  qty: number;
  limit_price: number | null;
  stop_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  strategy_id: string | null;
  is_training: boolean;
  notes: string | null;
  status: "open" | "filled" | "canceled" | "expired" | "rejected";
  filled_trade_id: string | null;
  fill_price: number | null;
  rejection_reason: string | null;
  expires_at: string | null;
  created_at: string;
  filled_at: string | null;
  canceled_at: string | null;
};

export type DBProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  is_pro: boolean;
  pro_until: string | null;
  highest_tier_unlocked: Tier;
  active_account_id: string | null;
  default_risk_pct: number | null;
  cooldown_minutes: number | null;
  plan: "free" | "pro" | "vip" | "enterprise";
  trial_until: string | null;
  roles: string[] | null;
  avatar_url: string | null;
  created_at: string;
};

export async function getProfile(): Promise<DBProfile | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return (data as DBProfile) ?? null;
}

export async function getAccounts(): Promise<DBAccount[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as DBAccount[];
}

export async function getActiveAccount(): Promise<DBAccount | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const sb = await createClient();
  if (profile.active_account_id) {
    const { data } = await sb
      .from("accounts")
      .select("*")
      .eq("id", profile.active_account_id)
      .single();
    if (data) return data as DBAccount;
  }
  // Fallback: most recently created active account
  const { data: list } = await sb
    .from("accounts")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  return ((list?.[0] as DBAccount) ?? null);
}

export async function createAccountForTier(tier: Tier): Promise<DBAccount> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const cfg = TIERS[tier];

  const insert = {
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
  };

  const { data, error } = await sb.from("accounts").insert(insert).select().single();
  if (error) throw error;

  // Make it active if user has none
  await sb.from("profiles").update({ active_account_id: data.id }).eq("id", user.id);

  return data as DBAccount;
}

export async function setActiveAccount(accountId: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("not authenticated");
  await sb.from("profiles").update({ active_account_id: accountId }).eq("id", user.id);
}

export async function getPositions(accountId: string): Promise<DBPosition[]> {
  const sb = await createClient();
  const { data } = await sb.from("positions").select("*").eq("account_id", accountId);
  return (data ?? []) as DBPosition[];
}

export async function getTrades(accountId: string, limit = 100): Promise<DBTrade[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("trades")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as DBTrade[];
}

export async function getWatchlist(): Promise<string[]> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb
    .from("watchlist")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => (r as { ticker: string }).ticker);
}
