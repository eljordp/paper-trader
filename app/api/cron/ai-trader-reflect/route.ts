import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
import { getQuotes } from "@/lib/yahoo";
import {
  getAllAiTraderProfiles,
  isCronAuthorized,
  type AiProfileConfig,
  type AiTraderProfile,
} from "@/lib/aiTrader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// End-of-day reflection. Reads today's trades, exits, post-trade reviews, and
// tick pulses for each AI profile; writes one `daily_reflection` row per AI
// capturing what happened, what was missed, and what tomorrow's brain should
// carry forward. Pure data — no email, no notifications.
async function reflectForProfile(
  config: AiProfileConfig,
  profile: AiTraderProfile,
  quotes: Record<string, { price: number; changePct: number }>,
): Promise<{ slug: string; trades: number; closed: number; pnl: number; lessons_count: number; error?: string }> {
  const sb = adminClient();
  const result = { slug: config.slug, trades: 0, closed: 0, pnl: 0, lessons_count: 0 } as {
    slug: string;
    trades: number;
    closed: number;
    pnl: number;
    lessons_count: number;
    error?: string;
  };
  if (!profile.active_account_id) {
    result.error = "no active account";
    return result;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const [tradesRes, decisionsRes, accountRes] = await Promise.all([
    sb
      .from("trades")
      .select("id, ticker, side, shares, price, realized_pnl, triggered_by, ai_strategy_id, created_at")
      .eq("account_id", profile.active_account_id)
      .gte("created_at", todayStartIso)
      .order("created_at", { ascending: true }),
    sb
      .from("ai_decisions")
      .select("id, decision_type, rationale, inputs, output, created_at")
      .eq("user_id", profile.id)
      .gte("created_at", todayStartIso)
      .order("created_at", { ascending: true }),
    sb
      .from("accounts")
      .select("cash, starting_cash, status")
      .eq("id", profile.active_account_id)
      .single(),
  ]);

  const trades = (tradesRes.data ?? []) as Array<{
    id: string;
    ticker: string;
    side: string;
    shares: number;
    price: number;
    realized_pnl: number | null;
    triggered_by: string | null;
    ai_strategy_id: string | null;
    created_at: string;
  }>;
  const decisions = (decisionsRes.data ?? []) as Array<{
    id: string;
    decision_type: string;
    rationale: string;
    inputs: unknown;
    output: unknown;
    created_at: string;
  }>;
  const account = accountRes.data as
    | { cash: number; starting_cash: number; status: string }
    | null;

  // Aggregations
  const closedTrades = trades.filter((t) => t.realized_pnl != null);
  const opens = trades.filter((t) => t.realized_pnl == null);
  const totalPnl = closedTrades.reduce((a, t) => a + Number(t.realized_pnl ?? 0), 0);
  const wins = closedTrades.filter((t) => Number(t.realized_pnl) > 0);
  const losses = closedTrades.filter((t) => Number(t.realized_pnl) <= 0);
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : null;

  // Pull tick-pulse near-misses: top closeness across the day
  const nearMisses: Array<{ status: string; closenessPct: number; strategy: string; ticker: string }> = [];
  for (const d of decisions) {
    if (d.decision_type !== "tick_pulse") continue;
    const inputs = d.inputs as { watching?: Array<{ strategy: string; ticker: string; status: string; closenessPct: number }> } | null;
    if (!inputs?.watching) continue;
    for (const w of inputs.watching) {
      if (w.closenessPct >= 75) nearMisses.push(w);
    }
  }
  nearMisses.sort((a, b) => b.closenessPct - a.closenessPct);
  const topNearMisses = nearMisses.slice(0, 5);

  // Post-trade reviews: pull thesis-held verdicts
  const reviews = decisions.filter((d) => d.decision_type === "post_trade_review");
  const thesisHeldCount = reviews.filter((r) => {
    const o = r.output as { thesis_held?: boolean } | null;
    return o?.thesis_held === true;
  }).length;

  // Coverage: how many distinct tickers got a trade vs how many were watched?
  const tradedTickers = new Set(trades.map((t) => t.ticker));
  const watchedTickers = new Set<string>();
  for (const d of decisions) {
    if (d.decision_type !== "tick_pulse") continue;
    const inputs = d.inputs as { watching?: Array<{ ticker: string }> } | null;
    for (const w of inputs?.watching ?? []) watchedTickers.add(w.ticker);
  }

  // Direction bias: how many shorts vs longs in today's research output?
  const researchRow = decisions.find((d) => d.decision_type === "daily_research");
  // We don't store strategy rules in the research output row; we can infer
  // from the strategy table. Fetch today's strategies.
  const { data: todayStrategies } = await sb
    .from("ai_strategies")
    .select("id, name, instruments, rules, status")
    .eq("user_id", profile.id)
    .gte("created_at", todayStartIso);
  const sList = (todayStrategies ?? []) as Array<{
    id: string;
    name: string;
    instruments: string[];
    rules: { side?: string };
    status: string;
  }>;
  const longCount = sList.filter((s) => s.rules.side === "long").length;
  const shortCount = sList.filter((s) => s.rules.side === "short").length;

  // Equity delta today (best effort from snapshots)
  const { data: snaps } = await sb
    .from("equity_snapshots")
    .select("equity, snapshot_at")
    .eq("account_id", profile.active_account_id)
    .gte("snapshot_at", todayStartIso)
    .order("snapshot_at", { ascending: true });
  const snapList = (snaps ?? []) as Array<{ equity: number; snapshot_at: string }>;
  const startEq = snapList[0]?.equity ?? account?.starting_cash ?? null;
  const endEq = snapList[snapList.length - 1]?.equity ?? null;
  const equityDeltaPct =
    startEq != null && endEq != null && startEq > 0
      ? ((endEq - startEq) / startEq) * 100
      : null;

  // Regime tags
  const spy = quotes["SPY"]?.changePct ?? null;
  const qqq = quotes["QQQ"]?.changePct ?? null;
  const vix = quotes["^VIX"]?.price ?? null;
  const regime =
    spy == null
      ? "unknown"
      : spy < -0.5
        ? "broad down"
        : spy > 0.5
          ? "broad up"
          : "mixed/quiet";

  // Lessons — concrete things to feed into tomorrow's research prompt
  const lessons: string[] = [];
  if (shortCount === 0 && (spy ?? 0) < -0.3) {
    lessons.push(
      "Brain proposed zero shorts on a broad-down session. Tomorrow's research must include at least one short setup on each major index regardless of opening read.",
    );
  }
  if (trades.length === 0 && topNearMisses.length > 0) {
    lessons.push(
      `No trades fired but ${topNearMisses.length} setups got ≥75% close. Top miss: ${topNearMisses[0].strategy} on ${topNearMisses[0].ticker} at ${topNearMisses[0].closenessPct.toFixed(0)}%. Consider loosening thresholds 0.05-0.10pp or shortening lookback windows.`,
    );
  }
  if (trades.length >= 1 && (account?.cash ?? 0) < (account?.starting_cash ?? 0) * 0.05) {
    lessons.push(
      "Account ran out of cash after the first fill. Cap notional per trade at 25-30% of starting equity so we keep bullets for other setups.",
    );
  }
  if (reviews.length > 0 && thesisHeldCount === 0) {
    lessons.push(
      "Every closed trade today had its thesis fail. Review entry rules for noise vs signal — consider raising magnitude thresholds or adding confirmation bars.",
    );
  }

  const rationale = [
    `Daily reflection — ${todayStart.toISOString().slice(0, 10)}.`,
    `Regime: ${regime} (SPY ${spy != null ? (spy >= 0 ? "+" : "") + spy.toFixed(2) + "%" : "n/a"}, QQQ ${qqq != null ? (qqq >= 0 ? "+" : "") + qqq.toFixed(2) + "%" : "n/a"}, VIX ${vix != null ? vix.toFixed(1) : "n/a"}).`,
    `Activity: ${trades.length} trade${trades.length === 1 ? "" : "s"} fired, ${closedTrades.length} closed (${wins.length}W/${losses.length}L${winRate != null ? `, ${(winRate * 100).toFixed(0)}% win` : ""}), ${opens.length} open. Realized P&L $${totalPnl.toFixed(2)}.`,
    `Coverage: ${tradedTickers.size} ticker${tradedTickers.size === 1 ? "" : "s"} traded out of ${watchedTickers.size} watched. Direction bias today: ${longCount}L / ${shortCount}S strategies promoted.`,
    `Near-misses (≥75%): ${topNearMisses.length === 0 ? "none" : topNearMisses.map((m) => `${m.strategy}/${m.ticker} ${m.closenessPct.toFixed(0)}%`).join(", ")}.`,
    `Thesis verdict on closed trades: ${reviews.length === 0 ? "no closed-trade reviews today" : `${thesisHeldCount}/${reviews.length} held.`}`,
    equityDeltaPct != null
      ? `Equity ${equityDeltaPct >= 0 ? "+" : ""}${equityDeltaPct.toFixed(2)}% today.`
      : "Equity delta n/a (no snapshots yet).",
    lessons.length === 0
      ? "No specific lessons flagged — clean session."
      : `Carry into tomorrow: ${lessons.map((l, i) => `(${i + 1}) ${l}`).join(" ")}`,
  ].join(" ");

  await sb.from("ai_decisions").insert({
    user_id: profile.id,
    decision_type: "daily_reflection",
    inputs: {
      date: todayStart.toISOString().slice(0, 10),
      brain_style: config.brainStyle,
      regime: { spy, qqq, vix, label: regime },
      trades: trades.length,
      closed: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      win_rate: winRate,
      open_positions: opens.length,
      total_pnl: totalPnl,
      coverage: {
        traded: Array.from(tradedTickers),
        watched: Array.from(watchedTickers),
      },
      direction_bias: { long: longCount, short: shortCount },
      top_near_misses: topNearMisses,
      thesis_held: { count: thesisHeldCount, total: reviews.length },
      equity_delta_pct: equityDeltaPct,
    },
    output: { lessons },
    rationale: `[${config.displayName}] ${rationale}`,
  });

  result.trades = trades.length;
  result.closed = closedTrades.length;
  result.pnl = totalPnl;
  result.lessons_count = lessons.length;
  return result;
}

async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const quotes = await getQuotes(["SPY", "QQQ", "^VIX"]).catch(
    () => ({}) as Record<string, { price: number; changePct: number }>,
  );

  const all = await getAllAiTraderProfiles();
  const results: Array<{
    slug: string;
    trades: number;
    closed: number;
    pnl: number;
    lessons_count: number;
    error?: string;
  }> = [];
  for (const { config, profile } of all) {
    if (!profile) {
      results.push({
        slug: config.slug,
        trades: 0,
        closed: 0,
        pnl: 0,
        lessons_count: 0,
        error: "not bootstrapped",
      });
      continue;
    }
    try {
      results.push(await reflectForProfile(config, profile, quotes));
    } catch (e) {
      results.push({
        slug: config.slug,
        trades: 0,
        closed: 0,
        pnl: 0,
        lessons_count: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
