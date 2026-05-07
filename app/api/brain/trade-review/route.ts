import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runTradeReview, type TradeReviewInput } from "@/lib/brain";
import { getCandles } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tradeId = body?.tradeId as string;
  if (!tradeId) return NextResponse.json({ error: "tradeId required" }, { status: 400 });

  // Fetch trade + verify ownership via account
  const { data: tradeRaw } = await sb
    .from("trades")
    .select("*, accounts!inner(user_id)")
    .eq("id", tradeId)
    .maybeSingle();
  if (!tradeRaw) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  const trade = tradeRaw as {
    id: string;
    account_id: string;
    ticker: string;
    side: "buy" | "sell";
    shares: number;
    price: number;
    realized_pnl: number | null;
    notes: string | null;
    triggered_by: string | null;
    strategy_id: string | null;
    created_at: string;
    review: unknown;
    accounts: { user_id: string } | { user_id: string }[];
  };
  const ownerId = Array.isArray(trade.accounts) ? trade.accounts[0]?.user_id : trade.accounts?.user_id;
  if (ownerId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (trade.side !== "sell" || trade.realized_pnl == null) {
    return NextResponse.json(
      { error: "Only closed trades (sells with realized P&L) can be reviewed" },
      { status: 400 }
    );
  }

  // Find the original buy(s) for entry price reference. Use most recent buy of same ticker BEFORE this sell on same account.
  const { data: priorBuy } = await sb
    .from("trades")
    .select("price, shares, created_at")
    .eq("account_id", trade.account_id)
    .eq("ticker", trade.ticker)
    .eq("side", "buy")
    .lt("created_at", trade.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const entryPrice = priorBuy
    ? Number((priorBuy as { price: number }).price)
    : Number(trade.price) - (Number(trade.realized_pnl) / Number(trade.shares));
  const entryTime = priorBuy ? (priorBuy as { created_at: string }).created_at : trade.created_at;

  // Fetch strategy details if tagged
  let strategyName: string | null = null;
  let strategyEntryRules: string | null = null;
  let strategyExitRules: string | null = null;
  if (trade.strategy_id) {
    const { data: strat } = await sb
      .from("strategies")
      .select("name, entry_rules, exit_rules")
      .eq("id", trade.strategy_id)
      .maybeSingle();
    if (strat) {
      const s = strat as { name: string; entry_rules: string | null; exit_rules: string | null };
      strategyName = s.name;
      strategyEntryRules = s.entry_rules;
      strategyExitRules = s.exit_rules;
    }
  }

  // Fetch candle data around the trade
  const tradeAgeDays =
    (Date.now() - new Date(trade.created_at).getTime()) / (24 * 60 * 60 * 1000);
  const range = tradeAgeDays > 5 ? "1M" : tradeAgeDays > 1 ? "5D" : "5D";
  let candles = await getCandles(trade.ticker, range).catch(() => []);
  if (candles.length === 0) {
    candles = await getCandles(trade.ticker, "1M").catch(() => []);
  }

  // Find indices of entry + exit candles
  const entryTs = Math.floor(new Date(entryTime).getTime() / 1000);
  const exitTs = Math.floor(new Date(trade.created_at).getTime() / 1000);
  const findClosest = (ts: number): number | null => {
    if (candles.length === 0) return null;
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const diff = Math.abs(candles[i].time - ts);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  };
  const entryCandleIdx = findClosest(entryTs);
  const exitCandleIdx = findClosest(exitTs);

  const realizedPnl = Number(trade.realized_pnl);
  const exitPrice = Number(trade.price);
  const realizedPnlPct =
    entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

  const input: TradeReviewInput = {
    ticker: trade.ticker,
    side: "sell",
    shares: Number(trade.shares),
    exitPrice,
    entryPrice,
    realizedPnl,
    realizedPnlPct,
    triggeredBy: trade.triggered_by,
    notes: trade.notes,
    strategyName,
    strategyEntryRules,
    strategyExitRules,
    closedAt: trade.created_at,
    candles,
    entryCandleIdx,
    exitCandleIdx,
  };

  const review = await runTradeReview(input);
  if (!review) return NextResponse.json({ error: "Brain unavailable" }, { status: 503 });

  // Save review to trade
  await sb
    .from("trades")
    .update({ review, review_at: new Date().toISOString() })
    .eq("id", tradeId);

  return NextResponse.json(review);
}
