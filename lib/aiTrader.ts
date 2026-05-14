import { adminClient } from "@/lib/admin";
import type { Tier } from "@/lib/tiers";

// AI brain style. Each style picks a different system prompt in aiLab.ts so
// the four AIs end up with genuinely different "personalities" even though
// they share the engine.
export type AiBrainStyle = "mixed" | "chart_reader" | "news" | "bear" | "options_directional";
export type InstrumentMode = "stock" | "options";

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
  // Optional: ticker focus. If set, the brain only proposes strategies on
  // these tickers. Use to build ticker-specialist bots (e.g. AI QQQ trades
  // ONLY QQQ + NQ=F). Leave undefined for generalist bots.
  tickerFocus?: string[];
  // Optional: if the account drops below resetAtCashPct of starting cash, the
  // engine logs an `account_reset` decision and resets cash back to
  // startingCash so the AI can keep running. Used by aggressive/yolo styles
  // where blowups are part of the design.
  resetAtCashPct?: number;
  // Cap on a single trade's notional value as a fraction of starting cash.
  // Stops the brain from putting the whole account on one tight-stop trade.
  // Default 0.30 (30%) so the AI can carry 3+ concurrent positions.
  maxNotionalPctPerTrade?: number;
  // Optional: if set to "options", this AI trades long calls/puts on the
  // underlyings it picks instead of stocks. Engine branches to the options
  // entry/exit path for these accounts. Defaults to "stock".
  instrumentMode?: InstrumentMode;
};

// Roster of all AI traders. Order matters — first entry is the legacy
// "ai-trader" account that existed before the multi-AI rollout.
export const AI_PROFILES: AiProfileConfig[] = [
  {
    // Legacy slug kept so existing URLs and the open SPY position don't break.
    slug: "ai-trader",
    displayName: "AI SPY",
    email: "ai-trader@paper-trader.local",
    brainStyle: "mixed",
    tier: "elite",
    startingCash: 250000,
    defaultRiskPct: 1.5,
    maxConcurrentPositions: 4,
    maxTradesPerDay: 6,
    tickerFocus: ["SPY", "ES=F"],
    maxNotionalPctPerTrade: 0.10, // 10% = ~$25K per trade, realistic retail size
    shortHeadline: "S&P 500 specialist — trades SPY and ES futures only.",
    fullDescription:
      "Focused on the S&P 500. Brain only proposes strategies on SPY and ES=F (the e-mini S&P 500 futures contract). Prefers ES for index trades because of leverage and tax treatment, falls back to SPY when futures don't fit the setup. $250K account, 1.5% risk per trade, 10% max notional per position (~$25K) so it can carry 4-6 concurrent positions without single-trade concentration.",
  },
  {
    slug: "ai-qqq",
    displayName: "AI QQQ",
    email: "ai-qqq@paper-trader.local",
    brainStyle: "mixed",
    tier: "elite",
    startingCash: 100000,
    defaultRiskPct: 2.0,
    maxConcurrentPositions: 4,
    maxTradesPerDay: 6,
    tickerFocus: ["QQQ", "NQ=F"],
    maxNotionalPctPerTrade: 0.10, // 10% = ~$10K per trade
    shortHeadline: "Nasdaq-100 specialist — trades QQQ and NQ futures only.",
    fullDescription:
      "Focused on the Nasdaq-100. Brain only proposes strategies on QQQ and NQ=F (the e-mini Nasdaq-100 futures contract). Prefers NQ for index trades because of leverage and tax treatment, falls back to QQQ when futures don't fit the setup. $100K account, 2.0% risk per trade, 10% max notional per position (~$10K).",
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
    maxNotionalPctPerTrade: 0.12, // 12% = ~$12K per trade
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
    maxNotionalPctPerTrade: 0.20, // 20% = ~$20K — conviction trades, bigger but not all-in
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
    maxNotionalPctPerTrade: 0.15, // 15% = ~$7.5K per trade
    shortHeadline: "Short-only — fades pops, breakdowns, weak sectors.",
    fullDescription:
      "Only shorts. Looks for failed breakouts, breakdowns through prior-day lows, and pops that fail at resistance. Exists to balance the long-bias of the other AIs so the leaderboard never has every AI on the same side of the market. $50K account, 3.5% risk per trade — small balance, hot hands.",
  },
  {
    slug: "ai-options",
    displayName: "AI Options",
    email: "ai-options@paper-trader.local",
    brainStyle: "options_directional",
    instrumentMode: "options",
    tier: "elite",
    startingCash: 25000,
    defaultRiskPct: 4.0,
    maxConcurrentPositions: 4,
    maxTradesPerDay: 4,
    maxNotionalPctPerTrade: 0.25, // 25% = ~$6.25K of premium per trade
    shortHeadline:
      "Buys ATM weekly calls/puts on SPY/QQQ/large-caps — long premium only.",
    fullDescription:
      "Directional options trader. Reads the same setups as the stock AIs but expresses them as long calls (bullish thesis) or long puts (bearish thesis) on the next-weekly ATM strike. Max loss per trade = premium paid × contracts × 100. No spreads, no naked short premium — keeps it simple. $25K account, 4% risk per trade. Theta works against you fast on weeklies so the brain skips mean-reversion and only trades momentum/breakout setups.",
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
    maxNotionalPctPerTrade: 0.30, // yolo gets a bigger per-trade cap, but not crazy
    resetAtCashPct: 0.30, // wipe + restart when down 70% from peak start
    shortHeadline: "Aggressive scaler — 7% per trade, restarts when it busts.",
    fullDescription:
      "The YOLO account. $50K, 7% risk per trade, up to 10 trades per day. Goal: scale as fast as possible. When it inevitably busts (cash drops below 30% of starting), the engine auto-resets it to $50K and logs the blowup so we can study what went wrong. Run resets are tracked publicly — survivorship-free record. Trades the same mixed-brain strategies as AI Trader but sized for compounding, not preservation.",
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
