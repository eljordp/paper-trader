import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
import { discoverFromTrades } from "@/lib/aiLab";
import { getAiTraderProfile, isCronAuthorized } from "@/lib/aiTrader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Weekly pattern detector. Runs Sunday evening, reads the AI Trader's last 7
// days of trades, calls the existing discoverFromTrades archaeologist, and
// stores the codified patterns as a `weekly_patterns` decision row so the
// public page surfaces "what the AI learned this week" and tomorrow's morning
// research can pull these lessons into context.
async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await getAiTraderProfile();
  if (!profile?.id || !profile.active_account_id) {
    return NextResponse.json({ error: "AI Trader not initialized" }, { status: 400 });
  }
  const sb = adminClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: tradesRaw } = await sb
    .from("trades")
    .select("ticker, side, realized_pnl, created_at, exited_at, notes, triggered_by, instrument_type")
    .eq("account_id", profile.active_account_id)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false });
  const trades = (tradesRaw ?? []) as Array<{
    ticker: string;
    side: string;
    realized_pnl: number | null;
    created_at: string;
    exited_at: string | null;
    notes: string | null;
    triggered_by: string | null;
    instrument_type: string;
  }>;

  const closed = trades.filter((t) => t.realized_pnl != null);

  if (closed.length < 10) {
    await sb.from("ai_decisions").insert({
      user_id: profile.id,
      decision_type: "weekly_patterns",
      inputs: { closed_trades: closed.length, lookback_days: 7 },
      output: { patterns: [], skipped: true },
      rationale: `Weekly review — only ${closed.length} closed trade${closed.length === 1 ? "" : "s"} in the last 7 days. Need at least 10 to extract reliable patterns. Skipped.`,
    });
    return NextResponse.json({ ok: true, skipped: true, closed_count: closed.length });
  }

  const patterns = await discoverFromTrades({
    trades: closed.map((t) => ({
      ticker: t.ticker,
      side: t.side as "buy" | "sell" | "short" | "cover",
      realizedPnl: t.realized_pnl,
      entryTime: t.created_at,
      exitTime: t.exited_at,
      notes: t.notes,
      triggeredBy: t.triggered_by,
      instrumentType: t.instrument_type,
    })),
  });

  // Win-rate breakdowns by side and ticker — deterministic stats alongside
  // the LLM patterns so the row is useful even if discoverFromTrades returns
  // a thin list.
  const byTicker: Record<string, { wins: number; losses: number; pnl: number }> = {};
  const byHour: Record<number, { wins: number; losses: number }> = {};
  for (const t of closed) {
    const r = Number(t.realized_pnl ?? 0);
    const win = r > 0;
    if (!byTicker[t.ticker]) byTicker[t.ticker] = { wins: 0, losses: 0, pnl: 0 };
    byTicker[t.ticker].pnl += r;
    if (win) byTicker[t.ticker].wins += 1;
    else byTicker[t.ticker].losses += 1;
    const hr = new Date(t.created_at).getUTCHours();
    if (!byHour[hr]) byHour[hr] = { wins: 0, losses: 0 };
    if (win) byHour[hr].wins += 1;
    else byHour[hr].losses += 1;
  }
  const totalPnl = closed.reduce((a, t) => a + Number(t.realized_pnl ?? 0), 0);
  const totalWins = closed.filter((t) => Number(t.realized_pnl) > 0).length;

  const topTickers = Object.entries(byTicker)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 5)
    .map(([t, v]) => `${t} ${v.wins}W/${v.losses}L $${v.pnl.toFixed(0)}`);

  const bestHour = Object.entries(byHour)
    .map(([h, v]) => ({
      hour: Number(h),
      rate: v.wins / Math.max(1, v.wins + v.losses),
      n: v.wins + v.losses,
    }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.rate - a.rate)[0];

  const rationale = [
    `Weekly review — last 7 days, ${closed.length} closed trades, ${totalWins}W/${closed.length - totalWins}L (${((totalWins / closed.length) * 100).toFixed(0)}% win), realized $${totalPnl.toFixed(2)}.`,
    `Top tickers by P&L: ${topTickers.join(" · ")}.`,
    bestHour
      ? `Best entry hour (UTC): ${bestHour.hour}:00 — ${(bestHour.rate * 100).toFixed(0)}% win across ${bestHour.n} trades.`
      : "Not enough volume per hour to pick a best entry window.",
    patterns.length > 0
      ? `Brain extracted ${patterns.length} pattern${patterns.length === 1 ? "" : "s"} to carry forward: ${patterns.map((p) => `"${p.name}"`).join(", ")}.`
      : "Brain didn't extract any reusable patterns this week — sample may still be too thin or signal too noisy.",
  ].join(" ");

  await sb.from("ai_decisions").insert({
    user_id: profile.id,
    decision_type: "weekly_patterns",
    inputs: {
      lookback_days: 7,
      closed_trades: closed.length,
      total_pnl: totalPnl,
      win_rate: totalWins / closed.length,
      by_ticker: byTicker,
      by_hour: byHour,
      best_hour_utc: bestHour ?? null,
    },
    output: { patterns },
    rationale,
  });

  return NextResponse.json({
    ok: true,
    closed_count: closed.length,
    patterns_extracted: patterns.length,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
