import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runStrategyCoach, type StrategyCoachInput } from "@/lib/brain";
import { getStrategyStats } from "@/lib/strategies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const strategyId = body?.strategyId as string;
  if (!strategyId) return NextResponse.json({ error: "strategyId required" }, { status: 400 });

  const stats = await getStrategyStats(strategyId);
  if (!stats) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

  // Recent trades tagged to this strategy
  const { data: accountsRaw } = await sb
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);
  const accountIds = ((accountsRaw ?? []) as Array<{ id: string }>).map((a) => a.id);

  const { data: tradesRaw } = await sb
    .from("trades")
    .select("ticker, side, realized_pnl, is_training, notes, triggered_by, created_at")
    .eq("strategy_id", strategyId)
    .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false })
    .limit(40);
  const trades = (tradesRaw ?? []) as Array<{
    ticker: string;
    side: "buy" | "sell";
    realized_pnl: number | null;
    is_training: boolean | null;
    notes: string | null;
    triggered_by: string | null;
    created_at: string;
  }>;

  const now = Date.now();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const recentTrades = trades.map((t) => {
    const d = new Date(t.created_at);
    return {
      ticker: t.ticker,
      side: t.side,
      realizedPnl: t.realized_pnl,
      isTraining: !!t.is_training,
      notes: t.notes,
      triggeredBy: t.triggered_by,
      timeOfDay: `${d.getUTCHours().toString().padStart(2, "0")}:${d
        .getUTCMinutes()
        .toString()
        .padStart(2, "0")}`,
      dayOfWeek: dayNames[d.getUTCDay()],
      daysAgo: Math.max(0, Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000))),
    };
  });

  const input: StrategyCoachInput = {
    strategy: {
      name: stats.strategy.name,
      description: stats.strategy.description,
      entryRules: stats.strategy.entry_rules,
      exitRules: stats.strategy.exit_rules,
      sizeRules: stats.strategy.size_rules,
      timeWindow: stats.strategy.time_window,
      instruments: stats.strategy.instruments,
    },
    stats: {
      totalTrades: stats.totalTrades,
      closes: stats.closes,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      avgWin: stats.avgWin,
      avgLoss: stats.avgLoss,
      avgRR: stats.avgRR,
      expectancy: stats.expectancy,
      largestWin: stats.largestWin,
      largestLoss: stats.largestLoss,
      totalRealized: stats.totalRealized,
      trainingTrades: stats.trainingTrades,
    },
    recentTrades,
  };

  const result = await runStrategyCoach(input);
  if (!result) return NextResponse.json({ error: "Brain unavailable" }, { status: 503 });
  return NextResponse.json(result);
}
