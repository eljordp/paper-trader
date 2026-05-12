import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
import { generateHypotheses, type GenerationContext } from "@/lib/aiLab";
import { getQuotes, getNews } from "@/lib/yahoo";
import { getAiTraderProfile, isCronAuthorized } from "@/lib/aiTrader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Daily research cycle for the AI Trader.
// 1. Pull fresh market state + news
// 2. Generate 5 strategy hypotheses via GPT
// 3. Filter to supported instruments (stocks + ES/NQ futures)
// 4. Auto-archive yesterday's live strategies that didn't fire
// 5. Mark the top 2 fresh strategies as live with conservative caps
const SUPPORTED_FUTURES = new Set(["ES=F", "NQ=F"]);
async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await getAiTraderProfile();
  if (!profile?.id || !profile.active_account_id) {
    return NextResponse.json(
      { error: "AI Trader not initialized" },
      { status: 400 },
    );
  }
  const sb = adminClient();

  const [quotes, news] = await Promise.all([
    getQuotes(["SPY", "QQQ", "^VIX"]).catch(
      () => ({}) as Record<string, { price: number; changePct: number }>,
    ),
    getNews().catch(() => []),
  ]);
  const SPY = quotes["SPY"] as { price: number; changePct: number } | undefined;
  const QQQ = quotes["QQQ"] as { price: number; changePct: number } | undefined;
  const VIX = quotes["^VIX"] as { price: number; changePct: number } | undefined;

  const now = Date.now();
  const recentHeadlines = (news ?? []).slice(0, 8).map((h) => ({
    title: h.title,
    tickers: (h.relatedTickers ?? []).slice(0, 3),
    minutesAgo: Math.max(
      0,
      Math.floor((now - new Date(h.publishedAt).getTime()) / 60_000),
    ),
  }));

  // Pull most recent daily_reflection + weekly_patterns rows so the brain
  // carries forward what it learned. Tight 7-day lookback keeps lessons
  // relevant to the current regime.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: lessonRows } = await sb
    .from("ai_decisions")
    .select("decision_type, output, rationale, created_at")
    .eq("user_id", profile.id)
    .in("decision_type", ["daily_reflection", "weekly_patterns"])
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(8);
  const recentLessons: string[] = [];
  for (const row of (lessonRows ?? []) as Array<{
    decision_type: string;
    output: unknown;
    rationale: string;
  }>) {
    const out = row.output as { lessons?: string[] | string; patterns?: Array<{ hypothesis?: string }> } | null;
    if (row.decision_type === "daily_reflection") {
      const raw = out?.lessons;
      if (Array.isArray(raw)) {
        for (const l of raw) if (typeof l === "string" && l.trim()) recentLessons.push(l.trim());
      } else if (typeof raw === "string" && raw.trim()) {
        // Older rows may have packed lessons into a single string. Split on
        // the "(N)" numbering the reflection writer uses.
        const parts = raw.split(/\(\d+\)\s*/g).map((p) => p.trim()).filter(Boolean);
        for (const p of parts) recentLessons.push(p);
      }
    } else if (row.decision_type === "weekly_patterns") {
      for (const p of out?.patterns ?? []) {
        if (p.hypothesis) recentLessons.push(`Weekly pattern — ${p.hypothesis}`);
      }
    }
  }

  const ctx: GenerationContext = {
    todayDate: new Date().toISOString().slice(0, 10),
    userTier: "elite",
    recentHeadlines,
    marketState: {
      spyPct: SPY?.changePct ?? null,
      qqqPct: QQQ?.changePct ?? null,
      vixLevel: VIX?.price ?? null,
    },
    recentLessons: recentLessons.slice(0, 6),
  };

  const generated = await generateHypotheses(ctx);
  // Allow stocks + the supported futures (ES, NQ). Drop strategies that
  // reference any unsupported futures (micros, gold, oil — schema-supported
  // but not yet on the AI Trader's product list).
  const supported = generated.filter((s) =>
    s.instruments.every((t) => !t.includes("=F") || SUPPORTED_FUTURES.has(t)),
  );
  if (supported.length === 0) {
    return NextResponse.json({ error: "Brain returned no supported strategies" }, { status: 503 });
  }

  // Archive yesterday's untriggered live strategies
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: stale } = await sb
    .from("ai_strategies")
    .select("id, last_signal_at, created_at")
    .eq("user_id", profile.id)
    .eq("status", "live")
    .lt("created_at", dayAgo);
  const staleIds = ((stale ?? []) as Array<{ id: string; last_signal_at: string | null }>)
    .filter((s) => !s.last_signal_at)
    .map((s) => s.id);
  if (staleIds.length > 0) {
    await sb
      .from("ai_strategies")
      .update({
        status: "archived",
        paused_reason: "no signals in 24h",
        paused_at: new Date().toISOString(),
      })
      .in("id", staleIds);
  }

  // Insert the new strategies
  const inserted: Array<{
    id: string;
    name: string;
    hypothesis: string;
    instruments: string[];
  }> = [];
  for (const s of supported.slice(0, 5)) {
    const { data } = await sb
      .from("ai_strategies")
      .insert({
        user_id: profile.id,
        account_id: profile.active_account_id,
        source: "generation",
        name: s.name,
        hypothesis: s.hypothesis,
        instruments: s.instruments,
        rules: s.rules,
        status: "proposed",
        max_account_risk_pct: 0.5,
        max_concurrent_positions: 2,
        max_trades_per_day: 3,
      })
      .select("id, name, hypothesis, instruments")
      .single();
    if (data) inserted.push(data as (typeof inserted)[number]);
  }

  // Promote the first 2 to live
  const promoteIds = inserted.slice(0, 2).map((s) => s.id);
  if (promoteIds.length > 0) {
    await sb
      .from("ai_strategies")
      .update({ status: "live" })
      .in("id", promoteIds);
  }

  await sb.from("ai_decisions").insert({
    user_id: profile.id,
    decision_type: "daily_research",
    inputs: ctx,
    output: {
      generated: supported.length,
      promoted_ids: promoteIds,
      archived_ids: staleIds,
    },
    rationale: `Morning research cycle. Market: SPY ${ctx.marketState.spyPct?.toFixed(2) ?? "?"}%, QQQ ${ctx.marketState.qqqPct?.toFixed(2) ?? "?"}%, VIX ${ctx.marketState.vixLevel?.toFixed(1) ?? "?"}. Reviewed ${recentHeadlines.length} headlines. Generated ${supported.length} supported hypotheses (stocks + ES/NQ), promoted top ${promoteIds.length} to live. Archived ${staleIds.length} stale strategies that didn't fire.`,
  });

  return NextResponse.json({
    archived: staleIds.length,
    generated: inserted.length,
    promoted: promoteIds.length,
    strategies: inserted,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
