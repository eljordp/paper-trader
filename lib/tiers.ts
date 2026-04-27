export type Tier = "rookie" | "phase1" | "phase2" | "pro" | "elite";

export type TierConfig = {
  id: Tier;
  name: string;
  startingCash: number;
  unlockedBy: Tier | null;
  rules: {
    profitTargetPct: number | null;
    dailyLossLimitPct: number | null;
    maxDrawdownPct: number | null;
    minTradingDays: number | null;
  };
  description: string;
  blurb: string;
};

export const TIERS: Record<Tier, TierConfig> = {
  rookie: {
    id: "rookie",
    name: "Rookie",
    startingCash: 10_000,
    unlockedBy: null,
    rules: {
      profitTargetPct: 10, // hit +10% to unlock phase1
      dailyLossLimitPct: null,
      maxDrawdownPct: null,
      minTradingDays: null,
    },
    description: "$10K. No rules. Practice freely. Hit +10% to unlock the $50K Phase 1.",
    blurb: "Free play. Build conviction.",
  },
  phase1: {
    id: "phase1",
    name: "Phase 1",
    startingCash: 50_000,
    unlockedBy: "rookie",
    rules: {
      profitTargetPct: 8, // FTMO Phase 1 = +8% target
      dailyLossLimitPct: 5,
      maxDrawdownPct: 10,
      minTradingDays: 5,
    },
    description:
      "$50K. FTMO-style rules: +8% target, max 5% daily loss, max 10% total drawdown, min 5 trading days.",
    blurb: "Funded eval simulation begins.",
  },
  phase2: {
    id: "phase2",
    name: "Phase 2",
    startingCash: 100_000,
    unlockedBy: "phase1",
    rules: {
      profitTargetPct: 5,
      dailyLossLimitPct: 5,
      maxDrawdownPct: 10,
      minTradingDays: 5,
    },
    description:
      "$100K. The verification round. +5% target, same loss rules. Pass this and you're a real eval candidate.",
    blurb: "Verification.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    startingCash: 250_000,
    unlockedBy: "phase2",
    rules: {
      profitTargetPct: 5,
      dailyLossLimitPct: 5,
      maxDrawdownPct: 10,
      minTradingDays: 5,
    },
    description:
      "$250K. Where the real funded firms put you when you pass. Same rules, bigger size, bigger consequences.",
    blurb: "Funded trader territory.",
  },
  elite: {
    id: "elite",
    name: "Elite",
    startingCash: 500_000,
    unlockedBy: "pro",
    rules: {
      profitTargetPct: null,
      dailyLossLimitPct: null,
      maxDrawdownPct: null,
      minTradingDays: null,
    },
    description: "$500K. No rules. You've graduated. This is for free practice at scale.",
    blurb: "Graduated. Trade freely.",
  },
};

export const TIER_ORDER: Tier[] = ["rookie", "phase1", "phase2", "pro", "elite"];

export function nextTier(t: Tier): Tier | null {
  const i = TIER_ORDER.indexOf(t);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

export function previousTier(t: Tier): Tier | null {
  const i = TIER_ORDER.indexOf(t);
  return i > 0 ? TIER_ORDER[i - 1] : null;
}

/**
 * Compute eval status for an account. Returns "passed", "failed", "active".
 * Failure reasons: daily loss limit hit, max drawdown hit, etc.
 */
export type EvalStatus = {
  status: "active" | "passed" | "failed";
  failureReason?: string;
  progress: {
    profitPct: number;
    profitTargetPct: number | null;
    drawdownPct: number;
    maxDrawdownPct: number | null;
    tradingDays: number;
    minTradingDays: number | null;
  };
};

export function computeEvalStatus(opts: {
  tier: Tier;
  startingCash: number;
  currentEquity: number;
  highWaterMark: number;
  tradingDays: number;
}): EvalStatus {
  const tier = TIERS[opts.tier];
  const { profitTargetPct, dailyLossLimitPct, maxDrawdownPct, minTradingDays } = tier.rules;

  const profitPct = ((opts.currentEquity - opts.startingCash) / opts.startingCash) * 100;
  const drawdownPct = ((opts.startingCash - opts.currentEquity) / opts.startingCash) * 100;

  // Failure conditions
  if (maxDrawdownPct != null && drawdownPct >= maxDrawdownPct) {
    return {
      status: "failed",
      failureReason: `Max drawdown of ${maxDrawdownPct}% breached`,
      progress: {
        profitPct,
        profitTargetPct,
        drawdownPct,
        maxDrawdownPct,
        tradingDays: opts.tradingDays,
        minTradingDays,
      },
    };
  }

  // Pass condition
  if (
    profitTargetPct != null &&
    profitPct >= profitTargetPct &&
    (minTradingDays == null || opts.tradingDays >= minTradingDays)
  ) {
    return {
      status: "passed",
      progress: {
        profitPct,
        profitTargetPct,
        drawdownPct,
        maxDrawdownPct,
        tradingDays: opts.tradingDays,
        minTradingDays,
      },
    };
  }

  return {
    status: "active",
    progress: {
      profitPct,
      profitTargetPct,
      drawdownPct,
      maxDrawdownPct,
      tradingDays: opts.tradingDays,
      minTradingDays,
    },
  };
}

export function isTierUnlocked(highestUnlocked: Tier, target: Tier): boolean {
  return TIER_ORDER.indexOf(target) <= TIER_ORDER.indexOf(highestUnlocked);
}
