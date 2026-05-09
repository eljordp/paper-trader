import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backtest, type StrategyRules } from "@/lib/aiLab";
import { getCandles, type Candle } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const strategyId = body?.strategyId as string;
  if (!strategyId) return NextResponse.json({ error: "strategyId required" }, { status: 400 });

  const { data: strategyRow } = await sb.from("ai_strategies").select("*").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
  if (!strategyRow) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  const strategy = strategyRow as { id: string; instruments: string[]; rules: StrategyRules; name: string };

  const candlesByTicker: Record<string, Candle[]> = {};
  for (const ticker of strategy.instruments) {
    try {
      const candles = await getCandles(ticker, "1M");
      if (candles.length > 0) candlesByTicker[ticker] = candles;
    } catch {}
  }
  if (Object.keys(candlesByTicker).length === 0) return NextResponse.json({ error: "Could not fetch any historical data" }, { status: 503 });

  const result = backtest(strategy.rules, candlesByTicker);
  if (!result) return NextResponse.json({ error: "Backtest failed" }, { status: 500 });

  await sb.from("ai_strategies").update({
    backtest: result, last_backtest_at: new Date().toISOString(),
    status: "backtested", updated_at: new Date().toISOString(),
  }).eq("id", strategyId);

  const interpretation = (() => {
    if (result.sampleSize === 0) return `Tested over ${result.periodStart?.slice(0, 10)} → ${result.periodEnd?.slice(0, 10)} but found ZERO trades. Entry conditions never triggered. The thesis is too restrictive.`;
    const verdict = result.expectancyPct > 0.1 && result.profitFactor > 1.4 && result.sampleSize >= 10 ? "EDGE FOUND" : result.expectancyPct > 0 ? "WEAK EDGE — needs more data" : "NO EDGE";
    return `${verdict}: ${result.sampleSize} trades over ${result.periodStart?.slice(0, 10)}→${result.periodEnd?.slice(0, 10)}. Win rate ${(result.winRate * 100).toFixed(0)}%, avg R/R ${result.avgRR.toFixed(2)}, expectancy ${result.expectancyPct >= 0 ? "+" : ""}${result.expectancyPct.toFixed(2)}%/trade, profit factor ${result.profitFactor === Infinity ? "∞" : result.profitFactor.toFixed(2)}, max drawdown ${result.maxDrawdownPct.toFixed(1)}%.`;
  })();

  await sb.from("ai_decisions").insert({
    user_id: user.id, strategy_id: strategyId, decision_type: "backtest_run",
    inputs: { strategy_name: strategy.name, instruments: strategy.instruments },
    output: result, rationale: interpretation,
  });

  return NextResponse.json({ result, interpretation });
}
