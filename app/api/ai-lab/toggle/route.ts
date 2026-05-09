import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const strategyId = body?.strategyId as string;
  const status = body?.status as "live" | "paused" | "archived";
  if (!strategyId || !["live", "paused", "archived"].includes(status)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: strategy } = await sb.from("ai_strategies").select("name, status").eq("id", strategyId).eq("user_id", user.id).maybeSingle();
  if (!strategy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = strategy as { name: string; status: string };

  await sb.from("ai_strategies").update({
    status,
    paused_reason: status === "paused" ? "User-initiated pause" : null,
    paused_at: status === "paused" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", strategyId).eq("user_id", user.id);

  await sb.from("ai_decisions").insert({
    user_id: user.id, strategy_id: strategyId,
    decision_type: status === "live" ? "strategy_promoted" : status === "paused" ? "strategy_paused" : "strategy_archived",
    output: { from: s.status, to: status },
    rationale: status === "live"
      ? `User promoted "${s.name}" to live trading. Will auto-fire signals when entry conditions trigger, with 1% account risk per trade.`
      : status === "paused"
      ? `User paused "${s.name}". No new signals will fire until resumed.`
      : `User archived "${s.name}". Strategy is dormant.`,
  });

  return NextResponse.json({ ok: true });
}
