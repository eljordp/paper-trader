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
  /** CSS color variable name (without `var()`) */
  color: string;
  /** RGB for inline alpha tinting */
  colorRgb: string;
};

export const TIERS: Record<Tier, TierConfig> = {
  rookie: {
    id: "rookie",
    name: "Rookie",
    startingCash: 25_000,
    unlockedBy: null,
    rules: {
      profitTargetPct: 8,
      dailyLossLimitPct: null,
      maxDrawdownPct: null,
      minTradingDays: null,
    },
    description: "$25K. No rules. Practice freely. Hit +8% to unlock the $50K Phase 1.",
    blurb: "Free play. Build conviction.",
    color: "var(--color-rookie)",
    colorRgb: "139, 149, 167",
  },
  phase1: {
    id: "phase1",
    name: "Phase 1",
    startingCash: 50_000,
    unlockedBy: "rookie",
    rules: {
      profitTargetPct: 8,
      dailyLossLimitPct: 5,
      maxDrawdownPct: 10,
      minTradingDays: 5,
    },
    description:
      "$50K. FTMO-style rules: +8% target, max 5% daily loss, max 10% total drawdown, min 5 trading days.",
    blurb: "Funded eval simulation begins.",
    color: "var(--color-phase1)",
    colorRgb: "59, 130, 246",
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
    color: "var(--color-phase2)",
    colorRgb: "168, 85, 247",
  },
  pro: {
    id: "pro",
    name: "Funded",
    startingCash: 150_000,
    unlockedBy: "phase2",
    rules: {
      profitTargetPct: 5,
      dailyLossLimitPct: 5,
      maxDrawdownPct: 10,
      minTradingDays: 5,
    },
    description:
      "$150K. Where the real funded firms put you when you pass. Same rules, bigger size, bigger consequences.",
    blurb: "Funded trader territory.",
    color: "var(--color-pro)",
    colorRgb: "245, 158, 11",
  },
  // Kept for backward compat with existing rows; not surfaced in TIER_ORDER.
  elite: {
    id: "elite",
    name: "Elite",
    startingCash: 250_000,
    unlockedBy: "pro",
    rules: {
      profitTargetPct: null,
      dailyLossLimitPct: null,
      maxDrawdownPct: null,
      minTradingDays: null,
    },
    description: "$250K. No rules. Free practice at scale.",
    blurb: "Graduated. Trade freely.",
    color: "var(--color-elite)",
    colorRgb: "236, 72, 153",
  },
};

export const TIER_ORDER: Tier[] = ["rookie", "phase1", "phase2", "pro"];

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
  /** Equity at last UTC midnight (null if first day). */
  yesterdayClose?: number | null;
  /** Firm profile overrides (when account.firm_profile is set) */
  firmRules?: {
    profitTargetDollars: number | null;
    dailyLossLimitDollars: number | null;
    maxDrawdownDollars: number | null;
    drawdownType: "static" | "trailing";
    trailingDdLockAtDollars: number | null;
    minTradingDays: number | null;
  } | null;
}): EvalStatus {
  // Firm-profile rules override tier defaults when present
  const fr = opts.firmRules ?? null;
  const tier = TIERS[opts.tier];

  // Resolve target/loss/dd in % terms (so existing UI works), preferring dollar-based when set
  const profitTargetPct =
    fr?.profitTargetDollars != null
      ? (fr.profitTargetDollars / opts.startingCash) * 100
      : tier.rules.profitTargetPct;
  const dailyLossLimitPct =
    fr?.dailyLossLimitDollars != null
      ? (fr.dailyLossLimitDollars / opts.startingCash) * 100
      : tier.rules.dailyLossLimitPct;
  const maxDrawdownPct =
    fr?.maxDrawdownDollars != null
      ? (fr.maxDrawdownDollars / opts.startingCash) * 100
      : tier.rules.maxDrawdownPct;
  const minTradingDays = fr?.minTradingDays ?? tier.rules.minTradingDays;

  const profitPct = ((opts.currentEquity - opts.startingCash) / opts.startingCash) * 100;

  // Drawdown calculation: static vs trailing
  let drawdownPct: number;
  if (fr?.drawdownType === "trailing" && fr.maxDrawdownDollars != null) {
    // Trailing DD threshold = HWM - maxDD (with optional lock at trailingDdLockAtDollars)
    const lockAt = fr.trailingDdLockAtDollars;
    const effectiveHwm = lockAt != null ? Math.min(opts.highWaterMark, lockAt) : opts.highWaterMark;
    const ddThreshold = effectiveHwm - fr.maxDrawdownDollars;
    const drawdownDollars = ddThreshold - opts.currentEquity;
    drawdownPct = (drawdownDollars / opts.startingCash) * 100;
  } else {
    drawdownPct = ((opts.startingCash - opts.currentEquity) / opts.startingCash) * 100;
  }

  // Daily loss limit (most common eval failure)
  if (dailyLossLimitPct != null && opts.yesterdayClose != null) {
    const dayLossPct = ((opts.yesterdayClose - opts.currentEquity) / opts.yesterdayClose) * 100;
    if (dayLossPct >= dailyLossLimitPct) {
      return {
        status: "failed",
        failureReason: `Daily loss limit of ${dailyLossLimitPct}% breached`,
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
  }

  // Max total drawdown
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
  // Legacy: 'elite' = everything unlocked
  if (highestUnlocked === "elite") return true;
  const targetIdx = TIER_ORDER.indexOf(target);
  const highestIdx = TIER_ORDER.indexOf(highestUnlocked);
  if (targetIdx === -1 || highestIdx === -1) return false;
  return targetIdx <= highestIdx;
}
