"use server";

import { createClient } from "@/lib/supabase/server";
import { TIERS, type Tier } from "@/lib/tiers";
import type { DBAccount, DBPosition, DBProfile, DBTrade } from "@/lib/db";
import { pickTodayChallenge, todayUtcDate, type ChallengeType } from "@/lib/challenges";

export type DBChallenge = {
  id: string;
  user_id: string;
  challenge_date: string;
  challenge_type: ChallengeType;
  challenge_data: Record<string, unknown> | null;
  completed: boolean;
  completed_at: string | null;
  failed: boolean;
  failed_at: string | null;
  created_at: string;
};

export type PortfolioSnapshot = {
  profile: DBProfile;
  activeAccount: DBAccount | null;
  accounts: DBAccount[];
  positions: DBPosition[];
  trades: DBTrade[];
  watchlist: string[];
  /** Equity at last snapshot before today's UTC midnight; null on first day. */
  yesterdayClose: number | null;
  /** Sum of realized P&L for today (UTC). */
  todayRealizedPnl: number;
  /** Today's daily challenge */
  todayChallenge: DBChallenge | null;
  /** Consecutive completed-challenge days, ending today or yesterday */
  challengeStreak: number;
  /** User's active strategies for trade ticket dropdown */
  strategies: Array<{ id: string; name: string }>;
  /** Open pending orders for the active account */
  openOrders: Array<{
    id: string;
    ticker: string;
    side: "buy" | "sell" | "short" | "cover";
    order_type: "limit" | "stop";
    qty: number;
    limit_price: number | null;
    stop_price: number | null;
    stop_loss: number | null;
    take_profit: number | null;
    created_at: string;
  }>;
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
  let yesterdayClose: number | null = null;
  let todayRealizedPnl = 0;
  if (activeAccount) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const [posRes, tradeRes, snapRes] = await Promise.all([
      sb.from("positions").select("*").eq("account_id", activeAccount.id),
      sb
        .from("trades")
        .select("*")
        .eq("account_id", activeAccount.id)
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("equity_snapshots")
        .select("equity")
        .eq("account_id", activeAccount.id)
        .lt("recorded_at", todayStart.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    positions = (posRes.data as DBPosition[]) ?? [];
    trades = (tradeRes.data as DBTrade[]) ?? [];
    if (snapRes.data) {
      yesterdayClose = Number((snapRes.data as { equity: number }).equity);
    }
    todayRealizedPnl = trades
      .filter((t) => new Date(t.created_at) >= todayStart)
      .reduce((acc, t) => acc + Number(t.realized_pnl ?? 0), 0);
  }

  // Watchlist (per-user)
  const { data: watchRows } = await sb
    .from("watchlist")
    .select("ticker")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const watchlist = (watchRows ?? []).map((r) => (r as { ticker: string }).ticker);

  // Daily challenge — get-or-create for today
  const todayStr = todayUtcDate();
  let { data: todayChallenge } = await sb
    .from("daily_challenges")
    .select("*")
    .eq("user_id", user.id)
    .eq("challenge_date", todayStr)
    .maybeSingle();
  if (!todayChallenge) {
    const type = pickTodayChallenge(user.id, todayStr);
    const { data: created } = await sb
      .from("daily_challenges")
      .insert({
        user_id: user.id,
        challenge_date: todayStr,
        challenge_type: type,
      })
      .select()
      .single();
    todayChallenge = created;
  }

  // Streak — count back from today/yesterday: consecutive completed days
  const { data: recentChallenges } = await sb
    .from("daily_challenges")
    .select("challenge_date, completed")
    .eq("user_id", user.id)
    .order("challenge_date", { ascending: false })
    .limit(60);
  let challengeStreak = 0;
  if (recentChallenges) {
    const completedDates = new Set(
      (recentChallenges as Array<{ challenge_date: string; completed: boolean }>)
        .filter((r) => r.completed)
        .map((r) => r.challenge_date)
    );
    // Start from today; if today is not completed, start from yesterday
    let cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    if (!completedDates.has(cursor.toISOString().slice(0, 10))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (completedDates.has(cursor.toISOString().slice(0, 10))) {
      challengeStreak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  // Active strategies (for trade ticket dropdown)
  const { data: stratRows } = await sb
    .from("strategies")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const strategies = ((stratRows ?? []) as Array<{ id: string; name: string }>) ?? [];

  // Open pending orders for active account
  let openOrders: PortfolioSnapshot["openOrders"] = [];
  if (activeAccount) {
    const { data: ordRows } = await sb
      .from("pending_orders")
      .select(
        "id, ticker, side, order_type, qty, limit_price, stop_price, stop_loss, take_profit, created_at"
      )
      .eq("account_id", activeAccount.id)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    openOrders = (ordRows ?? []) as PortfolioSnapshot["openOrders"];
  }

  return {
    profile: profile as DBProfile,
    activeAccount: (activeAccount as DBAccount) ?? null,
    accounts: (accounts as DBAccount[]) ?? [],
    positions,
    trades,
    watchlist,
    yesterdayClose,
    todayRealizedPnl,
    todayChallenge: (todayChallenge as DBChallenge) ?? null,
    challengeStreak,
    strategies,
    openOrders,
  };
}
