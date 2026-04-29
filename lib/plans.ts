import type { Tier } from "@/lib/tiers";

export type Plan = "free" | "pro" | "vip" | "enterprise";

export type PlanConfig = {
  id: Plan;
  name: string;
  priceLabel: string;
  priceUsd: number; // monthly
  blurb: string;
  features: string[];
  ctaLabel: string;
  /** Tier IDs unlocked by this plan (cumulative — e.g. VIP includes pro features) */
  unlockedTiers: Tier[];
  highlight?: boolean;
  trialDays?: number;
};

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    priceUsd: 0,
    blurb: "Forever",
    features: [
      "$10K Rookie account",
      "Real US stock market data",
      "Stop loss & take profit",
      "Trade journal",
      "Equity curve",
      "Daily challenge & streaks",
    ],
    ctaLabel: "Current plan",
    unlockedTiers: ["rookie"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "$19",
    priceUsd: 19,
    blurb: "/mo — Free 7-day trial",
    features: [
      "Everything in Free",
      "$50K Phase 1 + $100K Phase 2 accounts",
      "FTMO-style eval rules engine",
      "Multiple paper accounts",
      "Performance analytics (R-multiples, profit factor)",
      "Cancel anytime",
    ],
    ctaLabel: "Start 7-day free trial",
    unlockedTiers: ["rookie", "phase1", "phase2"],
    highlight: true,
    trialDays: 7,
  },
  vip: {
    id: "vip",
    name: "VIP",
    priceLabel: "$49",
    priceUsd: 49,
    blurb: "/mo",
    features: [
      "Everything in Pro",
      "$150K Funded account",
      "Options trading (calls / puts / spreads)",
      "Futures (micro contracts: MNQ, MES, MGC, MCL)",
      "Replay any past trading day",
      "Multi-firm rule profiles (FTMO, Apex, Topstep, MFFU)",
      "Priority support",
    ],
    ctaLabel: "Upgrade to VIP",
    unlockedTiers: ["rookie", "phase1", "phase2", "pro"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "$199",
    priceUsd: 199,
    blurb: "/mo — for trading rooms & mentors",
    features: [
      "Everything in VIP",
      "Team accounts (mentor + students)",
      "Custom branded leaderboard",
      "Custom eval rule profiles",
      "Dedicated success contact",
      "White-glove onboarding call",
    ],
    ctaLabel: "Talk to sales",
    unlockedTiers: ["rookie", "phase1", "phase2", "pro"],
  },
};

export const PLAN_ORDER: Plan[] = ["free", "pro", "vip", "enterprise"];

/**
 * Effective plan considering trial period.
 * If trial is active, user has 'pro' regardless of paid plan.
 */
export function effectivePlan(profile: {
  plan?: Plan | null;
  trial_until?: string | null;
  is_pro?: boolean | null;
  pro_until?: string | null;
}): Plan {
  const now = Date.now();

  // Active paid sub
  const paid = (profile.plan ?? "free") as Plan;
  const proUntil = profile.pro_until ? new Date(profile.pro_until).getTime() : 0;
  if (paid !== "free" && (proUntil === 0 || proUntil > now)) {
    return paid;
  }

  // Active free trial
  if (profile.trial_until && new Date(profile.trial_until).getTime() > now) {
    return "pro";
  }

  return "free";
}

export function trialDaysRemaining(trialUntil: string | null | undefined): number {
  if (!trialUntil) return 0;
  const ms = new Date(trialUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function isTrialActive(trialUntil: string | null | undefined): boolean {
  if (!trialUntil) return false;
  return new Date(trialUntil).getTime() > Date.now();
}

export function isTierUnlockedByPlan(plan: Plan, tier: Tier): boolean {
  return PLANS[plan].unlockedTiers.includes(tier);
}

export function planForTier(tier: Tier): Plan {
  if (tier === "rookie") return "free";
  if (tier === "phase1" || tier === "phase2") return "pro";
  if (tier === "pro") return "vip";
  if (tier === "elite") return "enterprise";
  return "free";
}
