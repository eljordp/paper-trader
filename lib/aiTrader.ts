import { adminClient } from "@/lib/admin";
import type { Tier } from "@/lib/tiers";

// AI brain style. Each style picks a different system prompt in aiLab.ts so
// the four AIs end up with genuinely different "personalities" even though
// they share the engine.
export type AiBrainStyle = "mixed" | "chart_reader" | "news" | "bear";

export type AiProfileConfig = {
  slug: string;                 // URL slug, e.g. "ai-chart-reader"
  displayName: string;          // shown on the public page
  email: string;                // auth email for the bot user
  brainStyle: AiBrainStyle;
  tier: Tier;                   // ladder tier (Elite = no eval rules)
  startingCash: number;
  defaultRiskPct: number;       // % of starting cash risked per trade
  maxConcurrentPositions: number;
  maxTradesPerDay: number;
  shortHeadline: string;        // 1-line pitch shown in the nav strip
  fullDescription: string;      // longer paragraph on the AI's own page
  // Optional: if the account drops below resetAtCashPct of starting cash, the
  // engine logs an `account_reset` decision and resets cash back to
  // startingCash so the AI can keep running. Used by aggressive/yolo styles
  // where blowups are part of the design.
  resetAtCashPct?: number;
};

// Roster of all AI traders. Order matters — first entry is the legacy
// "ai-trader" account that existed before the multi-AI rollout.
export const AI_PROFILES: AiProfileConfig[] = [
  {
    slug: "ai-trader",
    displayName: "AI Mixed",
    email: "ai-trader@paper-trader.local",
    brainStyle: "mixed",
    tier: "elite",
    startingCash: 250000,
    defaultRiskPct: 1.5,
    maxConcurrentPositions: 3,
    maxTradesPerDay: 5,
    shortHeadline: "Mean-reversion + breakouts + headlines mixed together.",
    fullDescription:
      "The original brain. Each morning it proposes 5 strategies across mean-reversion, breakouts, and news-driven setups, then picks the two it likes best for the day. Long-biased by default. $250K account, 1.5% risk per trade — biggest balance, most cautious sizing.",
  },
  {
    slug: "ai-chart-reader",
    displayName: "AI Chart Reader",
    email: "ai-chart-reader@paper-trader.local",
    brainStyle: "chart_reader",
    tier: "elite",
    startingCash: 100000,
    defaultRiskPct: 2.5,
    maxConcurrentPositions: 4,
    maxTradesPerDay: 6,
    shortHeadline:
      "Pure structural trader — breakouts, breakdowns, ICT optimal trade entries.",
    fullDescription:
      "Reads the chart like a human. Only takes trades based on structural levels — N-bar highs and lows, ICT Optimal Trade Entry (62-79% fib retraces of the most recent swing leg), and standard-deviation-of-open expansions when higher-timeframe SMT divergence is present. Never takes a trade based on an arbitrary % move. $100K account, 2.5% risk per trade — sizes up because each setup is structurally confirmed.",
  },
  {
    slug: "ai-news",
    displayName: "AI News",
    email: "ai-news@paper-trader.local",
    brainStyle: "news",
    tier: "elite",
    startingCash: 100000,
    defaultRiskPct: 2.0,
    maxConcurrentPositions: 2,
    maxTradesPerDay: 3,
    shortHeadline: "Headline-driven — 1-3 high-conviction trades per day.",
    fullDescription:
      "Reads the morning news, picks the 1-2 tickers with the strongest catalyst, and waits for an opening-range break in the direction of the catalyst. Caps itself at 3 trades per day — quality over quantity. $100K account, 2.0% risk per trade. Most likely AI to sit out a quiet news day with zero trades.",
  },
  {
    slug: "ai-bear",
    displayName: "AI Bear",
    email: "ai-bear@paper-trader.local",
    brainStyle: "bear",
    tier: "elite",
    startingCash: 50000,
    defaultRiskPct: 3.5,
    maxConcurrentPositions: 4,
    maxTradesPerDay: 6,
    shortHeadline: "Short-only — fades pops, breakdowns, weak sectors.",
    fullDescription:
      "Only shorts. Looks for failed breakouts, breakdowns through prior-day lows, and pops that fail at resistance. Exists to balance the long-bias of the other AIs so the leaderboard never has every AI on the same side of the market. $50K account, 3.5% risk per trade — small balance, hot hands.",
  },
  {
    slug: "ai-scaler",
    displayName: "AI Scaler",
    email: "ai-scaler@paper-trader.local",
    brainStyle: "mixed",
    tier: "elite",
    startingCash: 50000,
    defaultRiskPct: 7.0,
    maxConcurrentPositions: 5,
    maxTradesPerDay: 10,
    resetAtCashPct: 0.30, // wipe + restart when down 70% from peak start
    shortHeadline: "Aggressive scaler — 7% per trade, restarts when it busts.",
    fullDescription:
      "The YOLO account. $50K, 7% risk per trade, up to 10 trades per day. Goal: scale as fast as possible. When it inevitably busts (cash drops below 30% of starting), the engine auto-resets it to $50K and logs the blowup so we can study what went wrong. Run resets are tracked publicly — survivorship-free record. Trades the same mixed-brain strategies as AI Mixed but sized for compounding, not preservation.",
  },
];

// Convenience helpers
export function getAllAiProfileConfigs(): AiProfileConfig[] {
  return AI_PROFILES;
}

export function getAiProfileConfig(slug: string): AiProfileConfig | null {
  return AI_PROFILES.find((p) => p.slug === slug) ?? null;
}

// Backwards-compat exports — the original code referenced these by name. We
// keep them pointing at the legacy "ai-trader" slug so nothing breaks.
export const AI_TRADER_SLUG = AI_PROFILES[0].slug;
export const AI_TRADER_EMAIL = AI_PROFILES[0].email;
export const AI_TRADER_DISPLAY_NAME = AI_PROFILES[0].displayName;

export type AiTraderProfile = {
  id: string;
  display_name: string | null;
  active_account_id: string | null;
  slug: string | null;
};

// Look up the DB profile row for an AI by slug. Defaults to the legacy
// "ai-trader" so existing callers (research/tick/reflect crons) work unchanged
// until they're refactored to iterate the roster.
export async function getAiTraderProfile(
  slug: string = AI_TRADER_SLUG,
): Promise<AiTraderProfile | null> {
  const sb = adminClient();
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, active_account_id, slug")
    .eq("slug", slug)
    .maybeSingle();
  return (data as AiTraderProfile | null) ?? null;
}

// Fetch every AI profile that exists in the DB, paired with its config. AI
// profiles that haven't been bootstrapped yet return profile=null so callers
// can skip cleanly.
export async function getAllAiTraderProfiles(): Promise<
  Array<{ config: AiProfileConfig; profile: AiTraderProfile | null }>
> {
  const sb = adminClient();
  const slugs = AI_PROFILES.map((p) => p.slug);
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, active_account_id, slug")
    .in("slug", slugs);
  const rows = (data ?? []) as AiTraderProfile[];
  return AI_PROFILES.map((config) => ({
    config,
    profile: rows.find((r) => r.slug === config.slug) ?? null,
  }));
}

export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
