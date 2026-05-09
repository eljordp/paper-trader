import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateHypotheses, type GenerationContext } from "@/lib/aiLab";
import { getQuotes, getNews } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [quotes, news] = await Promise.all([
    getQuotes(["SPY", "QQQ", "^VIX"]).catch(() => ({} as Record<string, { price: number; changePct: number }>)),
    getNews().catch(() => []),
  ]);
  const SPY = quotes["SPY"] as { price: number; changePct: number } | undefined;
  const QQQ = quotes["QQQ"] as { price: number; changePct: number } | undefined;
  const VIX = quotes["^VIX"] as { price: number; changePct: number } | undefined;

  const now = Date.now();
  const recentHeadlines = (news ?? []).slice(0, 8).map((h) => ({
    title: h.title,
    tickers: (h.relatedTickers ?? []).slice(0, 3),
    minutesAgo: Math.max(0, Math.floor((now - new Date(h.publishedAt).getTime()) / 60000)),
  }));

  const { data: profile } = await sb.from("profiles").select("active_account_id").eq("id", user.id).single();
  const activeId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  const { data: account } = activeId ? await sb.from("accounts").select("tier").eq("id", activeId).single() : { data: null };
  const userTier = (account as { tier?: string } | null)?.tier ?? "rookie";

  const ctx: GenerationContext = {
    todayDate: new Date().toISOString().slice(0, 10),
    userTier,
    recentHeadlines,
    marketState: {
      spyPct: SPY?.changePct ?? null,
      qqqPct: QQQ?.changePct ?? null,
      vixLevel: VIX?.price ?? null,
    },
  };

  const strategies = await generateHypotheses(ctx);
  if (strategies.length === 0) return NextResponse.json({ error: "Brain unavailable or empty result" }, { status: 503 });

  const inserted: Array<{ id: string; name: string; hypothesis: string; instruments: string[]; rules: unknown }> = [];
  for (const s of strategies) {
    const { data } = await sb.from("ai_strategies").insert({
      user_id: user.id,
      account_id: activeId,
      source: "generation",
      name: s.name,
      hypothesis: s.hypothesis,
      instruments: s.instruments,
      rules: s.rules,
      status: "proposed",
    }).select("id, name, hypothesis, instruments, rules").single();
    if (data) inserted.push(data as typeof inserted[number]);
  }

  await sb.from("ai_decisions").insert({
    user_id: user.id,
    decision_type: "hypothesis_generated",
    inputs: ctx,
    output: { strategy_count: inserted.length, strategy_ids: inserted.map((s) => s.id) },
    rationale: `Generated ${inserted.length} strategy hypotheses based on market state (SPY ${ctx.marketState.spyPct?.toFixed(2) ?? "?"}%, QQQ ${ctx.marketState.qqqPct?.toFixed(2) ?? "?"}%, VIX ${ctx.marketState.vixLevel?.toFixed(1) ?? "?"}) and ${recentHeadlines.length} recent headlines.`,
  });

  return NextResponse.json({ strategies: inserted });
}
