import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runEvalCoach, type EvalCoachInput } from "@/lib/brain";
import { getQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("active_account_id")
    .eq("id", user.id)
    .single();
  const activeId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (!activeId) return NextResponse.json({ error: "No active account" }, { status: 400 });

  const { data: account } = await sb
    .from("accounts")
    .select("*")
    .eq("id", activeId)
    .single();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  // All trades for this account (for performance stats)
  const { data: trades } = await sb
    .from("trades")
    .select("ticker, side, price, total, realized_pnl, created_at")
    .eq("account_id", activeId)
    .order("created_at", { ascending: false })
    .limit(200);
  const allTrades = (trades ?? []) as Array<{
    ticker: string;
    side: "buy" | "sell";
    price: number;
    total: number;
    realized_pnl: number | null;
    created_at: string;
  }>;
  const closes = allTrades.filter((t) => t.realized_pnl != null);
  const wins = closes.filter((t) => Number(t.realized_pnl) > 0);
  const losses = closes.filter((t) => Number(t.realized_pnl) < 0);
  const winRate = closes.length > 0 ? wins.length / closes.length : null;

  const startingCash = Number(account.starting_cash);
  const winPctVals = wins.map((t) => (Number(t.realized_pnl) / startingCash) * 100);
  const lossPctVals = losses.map((t) => (Number(t.realized_pnl) / startingCash) * 100);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgWinPct = avg(winPctVals);
  const avgLossPct = avg(lossPctVals);
  const avgRR =
    avgWinPct != null && avgLossPct != null && avgLossPct !== 0
      ? Math.abs(avgWinPct / avgLossPct)
      : null;
  const largestSingleLossPct = lossPctVals.length ? Math.min(...lossPctVals) : null;

  // Compute current equity
  const { data: positions } = await sb
    .from("positions")
    .select("ticker, shares, avg_cost")
    .eq("account_id", activeId);
  const tickers = ((positions ?? []) as Array<{ ticker: string }>).map((p) => p.ticker);
  let positionsValue = 0;
  if (tickers.length) {
    const quotes = await getQuotes(tickers);
    positionsValue = ((positions ?? []) as Array<{ ticker: string; shares: number; avg_cost: number }>).reduce(
      (acc, p) => {
        const px = quotes[p.ticker]?.price ?? Number(p.avg_cost);
        return acc + Number(p.shares) * px;
      },
      0
    );
  }
  const cash = Number(account.cash);
  const equity = cash + positionsValue;
  const drawdownPct = startingCash > 0 ? Math.max(0, ((startingCash - equity) / startingCash) * 100) : 0;

  const createdAt = new Date(account.created_at).getTime();
  const daysSinceStart = Math.max(1, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));

  const input: EvalCoachInput = {
    tier: account.tier,
    startingCash,
    currentEquity: equity,
    cashAvailable: cash,
    drawdownPct,
    highWaterMark: Number(account.high_water_mark),
    rules: {
      profitTargetPct: account.profit_target_pct,
      dailyLossLimitPct: account.daily_loss_limit_pct,
      maxDrawdownPct: account.max_drawdown_pct,
      minTradingDays: account.min_trading_days,
    },
    tradingDaysCount: Number(account.trading_days_count ?? 0),
    tradesPlaced: allTrades.filter((t) => t.side === "buy").length,
    closedTrades: closes.length,
    winRate,
    avgWinPct,
    avgLossPct,
    avgRR,
    largestSingleLossPct,
    daysSinceStart,
    status: account.status,
  };

  const result = await runEvalCoach(input);
  if (!result) {
    return NextResponse.json(
      { error: "No eval rules on this account or brain unavailable" },
      { status: 200 }
    );
  }
  return NextResponse.json(result);
}
