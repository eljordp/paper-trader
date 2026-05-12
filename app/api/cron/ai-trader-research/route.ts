import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
import { generateHypotheses, type GenerationContext } from "@/lib/aiLab";
import { getQuotes, getNews } from "@/lib/yahoo";
import {
  AI_PROFILES,
  getAllAiTraderProfiles,
  isCronAuthorized,
  type AiProfileConfig,
  type AiTraderProfile,
} from "@/lib/aiTrader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Daily research cycle. Runs for EVERY AI profile in the roster — each gets
// its own brain style, position caps, and learning loop. Shared work
// (quotes, news, headline shaping) is fetched once and reused across all
// profiles.
const SUPPORTED_FUTURES = new Set(["ES=F", "NQ=F"]);

type ResearchPerProfile = {
  slug: string;
  brainStyle: AiProfileConfig["brainStyle"];
  generated: number;
  promoted: number;
  archived: number;
  strategies: Array<{ id: string; name: string; hypothesis: string; instruments: string[] }>;
  error?: string;
};

async function runResearchForProfile(
  config: AiProfileConfig,
  profile: AiTraderProfile,
  sharedCtx: Omit<GenerationContext, "recentLessons" | "brainStyle">,
): Promise<ResearchPerProfile> {
  const sb = adminClient();
  const out: ResearchPerProfile = {
    slug: config.slug,
    brainStyle: config.brainStyle,
    generated: 0,
    promoted: 0,
    archived: 0,
    strategies: [],
  };

  if (!profile.active_account_id) {
    out.error = "no active account";
    return out;
  }

  // Lessons specific to THIS AI — each brain learns from its own history.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: lessonRows } = await sb
    .from("ai_decisions")
    .select("decision_type, output")
    .eq("user_id", profile.id)
    .in("decision_type", ["daily_reflection", "weekly_patterns"])
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(8);

  const recentLessons: string[] = [];
  for (const row of (lessonRows ?? []) as Array<{ decision_type: string; output: unknown }>) {
    const o = row.output as
      | { lessons?: string[] | string; patterns?: Array<{ hypothesis?: string }> }
      | null;
    if (row.decision_type === "daily_reflection") {
      const raw = o?.lessons;
      if (Array.isArray(raw)) {
        for (const l of raw) if (typeof l === "string" && l.trim()) recentLessons.push(l.trim());
      } else if (typeof raw === "string" && raw.trim()) {
        const parts = raw.split(/\(\d+\)\s*/g).map((p) => p.trim()).filter(Boolean);
        for (const p of parts) recentLessons.push(p);
      }
    } else if (row.decision_type === "weekly_patterns") {
      for (const p of o?.patterns ?? []) {
        if (p.hypothesis) recentLessons.push(`Weekly pattern — ${p.hypothesis}`);
      }
    }
  }

  const ctx: GenerationContext = {
    ...sharedCtx,
    recentLessons: recentLessons.slice(0, 6),
    brainStyle: config.brainStyle,
    tickerFocus: config.tickerFocus,
  };

  const generated = await generateHypotheses(ctx);
  // Filter: supported futures contracts AND (if tickerFocus set) only the
  // focus tickers. Belt-and-suspenders behind the prompt instruction.
  const focusSet = config.tickerFocus ? new Set(config.tickerFocus) : null;
  const supported = generated.filter((s) => {
    if (!s.instruments.every((t) => !t.includes("=F") || SUPPORTED_FUTURES.has(t))) {
      return false;
    }
    if (focusSet && !s.instruments.every((t) => focusSet.has(t))) {
      return false;
    }
    return true;
  });
  if (supported.length === 0) {
    // News brain is allowed to return [] on a no-catalyst day; record it.
    out.error = "no supported strategies returned";
    await sb.from("ai_decisions").insert({
      user_id: profile.id,
      decision_type: "daily_research",
      inputs: ctx,
      output: { generated: 0, promoted_ids: [], archived_ids: [] },
      rationale: `Morning research (${config.brainStyle}) — brain returned no actionable setups today.`,
    });
    return out;
  }

  // Archive yesterday's untriggered live strategies for THIS AI
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: stale } = await sb
    .from("ai_strategies")
    .select("id, last_signal_at, created_at, instruments")
    .eq("user_id", profile.id)
    .eq("status", "live")
    .lt("created_at", dayAgo);
  const staleIds = ((stale ?? []) as Array<{
    id: string;
    last_signal_at: string | null;
    instruments: string[];
  }>)
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
  out.archived = staleIds.length;

  // If this AI has a ticker focus, also archive any live strategy whose
  // instruments don't match — this cleans up off-focus strategies left over
  // from before the ticker-focus rollout (e.g. the old QQQ strategy that
  // was riding on AI SPY's account).
  if (config.tickerFocus) {
    const focus = new Set(config.tickerFocus);
    const { data: offFocus } = await sb
      .from("ai_strategies")
      .select("id, instruments")
      .eq("user_id", profile.id)
      .in("status", ["live", "proposed"]);
    const offFocusIds = ((offFocus ?? []) as Array<{ id: string; instruments: string[] }>)
      .filter((s) => !s.instruments.every((t) => focus.has(t)))
      .map((s) => s.id);
    if (offFocusIds.length > 0) {
      await sb
        .from("ai_strategies")
        .update({
          status: "archived",
          paused_reason: "off-focus ticker after roster split",
          paused_at: new Date().toISOString(),
        })
        .in("id", offFocusIds);
      out.archived += offFocusIds.length;
    }
  }

  // Insert new strategies with profile-specific risk caps
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
        max_account_risk_pct: config.defaultRiskPct,
        max_concurrent_positions: config.maxConcurrentPositions,
        max_trades_per_day: config.maxTradesPerDay,
      })
      .select("id, name, hypothesis, instruments")
      .single();
    if (data) out.strategies.push(data as (typeof out.strategies)[number]);
  }
  out.generated = out.strategies.length;

  // Promote: News brain only promotes 1; everyone else promotes 2
  const promoteCount = config.brainStyle === "news" ? 1 : 2;
  const promoteIds = out.strategies.slice(0, promoteCount).map((s) => s.id);
  if (promoteIds.length > 0) {
    await sb.from("ai_strategies").update({ status: "live" }).in("id", promoteIds);
  }
  out.promoted = promoteIds.length;

  await sb.from("ai_decisions").insert({
    user_id: profile.id,
    decision_type: "daily_research",
    inputs: ctx,
    output: {
      generated: out.generated,
      promoted_ids: promoteIds,
      archived_ids: staleIds,
      brain_style: config.brainStyle,
    },
    rationale: `Morning research (${config.brainStyle}). Market: SPY ${ctx.marketState.spyPct?.toFixed(2) ?? "?"}%, QQQ ${ctx.marketState.qqqPct?.toFixed(2) ?? "?"}%, VIX ${ctx.marketState.vixLevel?.toFixed(1) ?? "?"}. Generated ${out.generated} hypothesis${out.generated === 1 ? "" : "es"}, promoted ${out.promoted} live, archived ${out.archived} stale. Risk: ${config.defaultRiskPct}% per trade, max ${config.maxTradesPerDay}/day, ${config.maxConcurrentPositions} concurrent.`,
  });

  return out;
}

async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  const sharedCtx = {
    todayDate: new Date().toISOString().slice(0, 10),
    userTier: "elite",
    recentHeadlines,
    marketState: {
      spyPct: SPY?.changePct ?? null,
      qqqPct: QQQ?.changePct ?? null,
      vixLevel: VIX?.price ?? null,
    },
  };

  const all = await getAllAiTraderProfiles();
  const results: ResearchPerProfile[] = [];
  for (const { config, profile } of all) {
    if (!profile) {
      results.push({
        slug: config.slug,
        brainStyle: config.brainStyle,
        generated: 0,
        promoted: 0,
        archived: 0,
        strategies: [],
        error: "profile not bootstrapped",
      });
      continue;
    }
    try {
      results.push(await runResearchForProfile(config, profile, sharedCtx));
    } catch (e) {
      results.push({
        slug: config.slug,
        brainStyle: config.brainStyle,
        generated: 0,
        promoted: 0,
        archived: 0,
        strategies: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Reference AI_PROFILES so the import isn't dead even if all profiles are
  // unbootstrapped (no-op at runtime).
  void AI_PROFILES.length;

  return NextResponse.json({ results });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
