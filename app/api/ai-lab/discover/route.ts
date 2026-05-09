import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverFromTrades, type DiscoveryContext } from "@/lib/aiLab";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb.from("profiles").select("active_account_id").eq("id", user.id).single();
  const activeId = (profile as { active_account_id: string | null } | null)?.active_account_id;

  const { data: accountsRaw } = await sb.from("accounts").select("id").eq("user_id", user.id);
  const accountIds = ((accountsRaw ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (accountIds.length === 0) return NextResponse.json({ strategies: [], message: "No trades yet — take 10+ trades first." });

  const { data: tradesRaw } = await sb.from("trades")
    .select("ticker, side, realized_pnl, notes, triggered_by, created_at, instrument_type")
    .in("account_id", accountIds).order("created_at", { ascending: false }).limit(50);
  const trades = ((tradesRaw ?? []) as Array<{
    ticker: string; side: "buy" | "sell" | "short" | "cover"; realized_pnl: number | null;
    notes: string | null; triggered_by: string | null; created_at: string; instrument_type: string;
  }>).map((t) => ({
    ticker: t.ticker, side: t.side, realizedPnl: t.realized_pnl, entryTime: t.created_at,
    exitTime: t.realized_pnl != null ? t.created_at : null, notes: t.notes,
    triggeredBy: t.triggered_by, instrumentType: t.instrument_type ?? "stock",
  }));

  if (trades.length < 10) return NextResponse.json({ strategies: [], message: `Only ${trades.length} trades — need 10+ to find patterns.` });

  const ctx: DiscoveryContext = { trades };
  const strategies = await discoverFromTrades(ctx);
  if (strategies.length === 0) {
    await sb.from("ai_decisions").insert({
      user_id: user.id, decision_type: "discovery_run", inputs: { trade_count: trades.length },
      output: { strategy_count: 0 }, rationale: `Analyzed ${trades.length} trades but couldn't extract clear patterns yet.`,
    });
    return NextResponse.json({ strategies: [], message: "Couldn't find a clean repeating pattern yet. Keep trading." });
  }

  const inserted: Array<{ id: string; name: string; hypothesis: string; instruments: string[]; rules: unknown }> = [];
  for (const s of strategies) {
    const { data } = await sb.from("ai_strategies").insert({
      user_id: user.id, account_id: activeId, source: "discovery", name: s.name, hypothesis: s.hypothesis,
      instruments: s.instruments, rules: s.rules, status: "proposed",
    }).select("id, name, hypothesis, instruments, rules").single();
    if (data) inserted.push(data as typeof inserted[number]);
  }

  await sb.from("ai_decisions").insert({
    user_id: user.id, decision_type: "discovery_run", inputs: { trade_count: trades.length },
    output: { strategy_count: inserted.length, strategy_ids: inserted.map((s) => s.id) },
    rationale: `Reviewed ${trades.length} trades and codified ${inserted.length} repeating winning patterns.`,
  });

  return NextResponse.json({ strategies: inserted });
}
