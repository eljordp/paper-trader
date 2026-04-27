import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreTrade, type ScoreInput } from "@/lib/brain";
import { getQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  notes: string | null;
};

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!body?.ticker || !body?.side || !Number.isFinite(body.shares) || !Number.isFinite(body.price)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Fetch profile + active account
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

  // Recent trades — last 5
  const { data: recent } = await sb
    .from("trades")
    .select("ticker, side, realized_pnl, triggered_by, created_at")
    .eq("account_id", activeId)
    .order("created_at", { ascending: false })
    .limit(5);
  const now = Date.now();
  const recentTrades = ((recent ?? []) as Array<{
    ticker: string;
    side: string;
    realized_pnl: number | null;
    triggered_by: string | null;
    created_at: string;
  }>).map((t) => ({
    ticker: t.ticker,
    side: t.side,
    realizedPnl: t.realized_pnl,
    triggeredBy: t.triggered_by,
    minutesAgo: Math.floor((now - new Date(t.created_at).getTime()) / 60000),
  }));

  // Today's stats
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayTrades } = await sb
    .from("trades")
    .select("realized_pnl")
    .eq("account_id", activeId)
    .gte("created_at", todayStart.toISOString());
  const closes = ((todayTrades ?? []) as Array<{ realized_pnl: number | null }>).filter(
    (t) => t.realized_pnl != null
  );
  const winRate =
    closes.length > 0
      ? closes.filter((t) => Number(t.realized_pnl) > 0).length / closes.length
      : null;

  // Equity = cash + position values (use current quotes)
  const { data: positions } = await sb
    .from("positions")
    .select("ticker, shares, avg_cost")
    .eq("account_id", activeId);
  const tickers = ((positions ?? []) as Array<{ ticker: string; shares: number; avg_cost: number }>).map(
    (p) => p.ticker
  );
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
  const startingCash = Number(account.starting_cash);
  const drawdownPct = startingCash > 0 ? ((startingCash - equity) / startingCash) * 100 : 0;

  // Yesterday's close for day's P&L
  const { data: snap } = await sb
    .from("equity_snapshots")
    .select("equity")
    .eq("account_id", activeId)
    .lt("recorded_at", todayStart.toISOString())
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const yesterdayClose = snap ? Number((snap as { equity: number }).equity) : startingCash;
  const dayPnl = equity - yesterdayClose;

  const cooldownUntil = account.cooldown_until ? new Date(account.cooldown_until).getTime() : 0;
  const inCooldown = cooldownUntil > now;

  const input: ScoreInput = {
    ticker: body.ticker.toUpperCase(),
    side: body.side,
    shares: body.shares,
    price: body.price,
    stopLoss: body.stopLoss,
    takeProfit: body.takeProfit,
    notes: body.notes,
    account: {
      tier: account.tier,
      cash,
      startingCash,
      equity,
      dayPnl,
      dailyLossLimitPct: account.daily_loss_limit_pct,
      maxDrawdownPct: account.max_drawdown_pct,
      drawdownPct,
      tradingDaysCount: account.trading_days_count ?? 0,
      inCooldown,
    },
    recentTrades,
    todayTradesCount: (todayTrades ?? []).length,
    todayWinRate: winRate,
  };

  const score = await scoreTrade(input);
  if (!score) return NextResponse.json({ error: "Brain unavailable" }, { status: 503 });
  return NextResponse.json(score);
}
