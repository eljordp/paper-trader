"use server";

import { createClient } from "@/lib/supabase/server";
import { TIERS, type Tier } from "@/lib/tiers";
import type { DBAccount, DBPosition, DBProfile, DBTrade } from "@/lib/db";

export type PortfolioSnapshot = {
  profile: DBProfile;
  activeAccount: DBAccount | null;
  accounts: DBAccount[];
  positions: DBPosition[];
  trades: DBTrade[];
  watchlist: string[];
};

/**
 * Fetch everything the UI needs in one call, server-side.
 * Auto-creates a Rookie account if user has none.
 */
export async function loadPortfolio(): Promise<PortfolioSnapshot | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  // Profile (auto-created by trigger; if missing for some reason, create)
  let { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    const { data: created } = await sb
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        display_name: user.email?.split("@")[0] ?? "trader",
      })
      .select()
      .single();
    profile = created;
  }

  // Accounts — auto-create Rookie if none exist
  let { data: accounts } = await sb
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });
  if (!accounts || accounts.length === 0) {
    const cfg = TIERS.rookie;
    const { data: rookie } = await sb
      .from("accounts")
      .insert({
        user_id: user.id,
        name: cfg.name,
        tier: "rookie" as Tier,
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
    if (rookie) {
      await sb.from("profiles").update({ active_account_id: rookie.id }).eq("id", user.id);
      accounts = [rookie];
      profile = { ...(profile as DBProfile), active_account_id: rookie.id };
    }
  }

  // Active account
  let activeAccount: DBAccount | null = null;
  if (profile?.active_account_id) {
    activeAccount =
      (accounts ?? []).find((a) => a.id === profile.active_account_id) ?? null;
  }
  if (!activeAccount && accounts && accounts.length > 0) {
    activeAccount = accounts[0] as DBAccount;
    await sb.from("profiles").update({ active_account_id: activeAccount.id }).eq("id", user.id);
  }

  // Positions + trades for active account
  let positions: DBPosition[] = [];
  let trades: DBTrade[] = [];
  if (activeAccount) {
    const [posRes, tradeRes] = await Promise.all([
      sb.from("positions").select("*").eq("account_id", activeAccount.id),
      sb
        .from("trades")
        .select("*")
        .eq("account_id", activeAccount.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    positions = (posRes.data as DBPosition[]) ?? [];
    trades = (tradeRes.data as DBTrade[]) ?? [];
  }

  // Watchlist (per-user)
  const { data: watchRows } = await sb
    .from("watchlist")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const watchlist = (watchRows ?? []).map((r) => (r as { ticker: string }).ticker);

  return {
    profile: profile as DBProfile,
    activeAccount: (activeAccount as DBAccount) ?? null,
    accounts: (accounts as DBAccount[]) ?? [],
    positions,
    trades,
    watchlist,
  };
}
