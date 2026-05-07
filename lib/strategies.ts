"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type DBStrategy = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  entry_rules: string | null;
  exit_rules: string | null;
  size_rules: string | null;
  time_window: string | null;
  instruments: string[] | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StrategyStats = {
  strategy: DBStrategy;
  totalTrades: number;
  buys: number;
  sells: number;
  closes: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalRealized: number;
  avgWin: number | null;
  avgLoss: number | null;
  avgRR: number | null; // ratio
  expectancy: number | null; // $ per trade
  largestWin: number | null;
  largestLoss: number | null;
  lastTradedAt: string | null;
  trainingTrades: number;
};

export async function listStrategies(): Promise<DBStrategy[]> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb
    .from("strategies")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as DBStrategy[]) ?? [];
}

export async function getStrategy(id: string): Promise<DBStrategy | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("strategies")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as DBStrategy) ?? null;
}

export async function getStrategyStats(strategyId: string): Promise<StrategyStats | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const strategy = await getStrategy(strategyId);
  if (!strategy) return null;

  // All trades tagged to this strategy across all of user's accounts
  const { data: accountsRaw } = await sb
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);
  const accountIds = ((accountsRaw ?? []) as Array<{ id: string }>).map((a) => a.id);

  if (accountIds.length === 0) {
    return baseStats(strategy);
  }

  const { data: tradesRaw } = await sb
    .from("trades")
    .select("side, realized_pnl, is_training, created_at")
    .eq("strategy_id", strategyId)
    .in("account_id", accountIds);
  const trades = (tradesRaw ?? []) as Array<{
    side: "buy" | "sell";
    realized_pnl: number | null;
    is_training: boolean | null;
    created_at: string;
  }>;

  if (trades.length === 0) return baseStats(strategy);

  const buys = trades.filter((t) => t.side === "buy").length;
  const sells = trades.filter((t) => t.side === "sell").length;
  const closes = trades.filter((t) => t.realized_pnl != null);
  const wins = closes.filter((t) => Number(t.realized_pnl) > 0);
  const losses = closes.filter((t) => Number(t.realized_pnl) < 0);
  const totalRealized = closes.reduce((acc, t) => acc + Number(t.realized_pnl), 0);
  const winRate = closes.length > 0 ? wins.length / closes.length : null;
  const avgWin =
    wins.length > 0
      ? wins.reduce((a, t) => a + Number(t.realized_pnl), 0) / wins.length
      : null;
  const avgLoss =
    losses.length > 0
      ? losses.reduce((a, t) => a + Number(t.realized_pnl), 0) / losses.length
      : null;
  const avgRR =
    avgWin != null && avgLoss != null && avgLoss !== 0
      ? Math.abs(avgWin / avgLoss)
      : null;
  const expectancy = closes.length > 0 ? totalRealized / closes.length : null;
  const largestWin =
    wins.length > 0 ? Math.max(...wins.map((t) => Number(t.realized_pnl))) : null;
  const largestLoss =
    losses.length > 0 ? Math.min(...losses.map((t) => Number(t.realized_pnl))) : null;
  const lastTradedAt = trades.reduce((latest, t) => {
    return !latest || new Date(t.created_at) > new Date(latest) ? t.created_at : latest;
  }, "" as string);
  const trainingTrades = trades.filter((t) => t.is_training).length;

  return {
    strategy,
    totalTrades: trades.length,
    buys,
    sells,
    closes: closes.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    totalRealized,
    avgWin,
    avgLoss,
    avgRR,
    expectancy,
    largestWin,
    largestLoss,
    lastTradedAt: lastTradedAt || null,
    trainingTrades,
  };
}

function baseStats(strategy: DBStrategy): StrategyStats {
  return {
    strategy,
    totalTrades: 0,
    buys: 0,
    sells: 0,
    closes: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    totalRealized: 0,
    avgWin: null,
    avgLoss: null,
    avgRR: null,
    expectancy: null,
    largestWin: null,
    largestLoss: null,
    lastTradedAt: null,
    trainingTrades: 0,
  };
}

export async function listStrategyStats(): Promise<StrategyStats[]> {
  const strategies = await listStrategies();
  const result: StrategyStats[] = [];
  for (const s of strategies) {
    const stats = await getStrategyStats(s.id);
    if (stats) result.push(stats);
  }
  return result;
}

export async function createStrategy(formData: FormData) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");

  const insert = {
    user_id: user.id,
    name,
    description: stringOrNull(formData.get("description")),
    entry_rules: stringOrNull(formData.get("entry_rules")),
    exit_rules: stringOrNull(formData.get("exit_rules")),
    size_rules: stringOrNull(formData.get("size_rules")),
    time_window: stringOrNull(formData.get("time_window")),
    instruments: arrayOrNull(formData.get("instruments")),
  };

  const { data, error } = await sb
    .from("strategies")
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/strategies");
  revalidatePath("/", "layout");
  return data as DBStrategy;
}

export async function updateStrategy(id: string, formData: FormData) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const update = {
    name: String(formData.get("name") ?? "").trim(),
    description: stringOrNull(formData.get("description")),
    entry_rules: stringOrNull(formData.get("entry_rules")),
    exit_rules: stringOrNull(formData.get("exit_rules")),
    size_rules: stringOrNull(formData.get("size_rules")),
    time_window: stringOrNull(formData.get("time_window")),
    instruments: arrayOrNull(formData.get("instruments")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("strategies")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/strategies");
  revalidatePath(`/strategies/${id}`);
}

export async function deleteStrategy(id: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await sb
    .from("strategies")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/strategies");
}

function stringOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

function arrayOrNull(v: FormDataEntryValue | null): string[] | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}
