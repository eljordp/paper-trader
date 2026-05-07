/**
 * Catalog of real funded prop firm eval profiles.
 * Numbers are best-effort approximations of the firms' published rules as of 2026.
 * Always tell users to check the firm's current docs before paying for a real eval.
 */

export type FirmId = "ftmo" | "apex" | "topstep" | "mff" | "the5ers" | "custom";

export type FirmProfileConfig = {
  id: string; // e.g. 'ftmo_phase1_100k'
  firm: FirmId;
  firmDisplay: string;
  evalName: string; // e.g. 'Phase 1', 'Tradovate $50K Combine'
  displayName: string; // full readable name e.g. 'FTMO Phase 1 — $100K'
  startingCash: number;
  profitTargetDollars: number;
  dailyLossLimitDollars: number | null; // null = no daily limit
  maxDrawdownDollars: number;
  drawdownType: "static" | "trailing";
  /** For trailing DD profiles, the threshold can lock once equity reaches this absolute amount. null = always trails. */
  trailingDdLockAtDollars: number | null;
  minTradingDays: number;
  consistencyRulePct: number | null; // e.g. 30 for Apex (no single day > 30% of total profit)
  noOvernight: boolean;
  // Color / branding
  color: string; // CSS variable
  colorRgb: string;
  description: string;
  rulesSummary: string[]; // displayed on the card
};

export const FIRM_PROFILES: Record<string, FirmProfileConfig> = {
  // ─────── FTMO ───────
  ftmo_p1_100k: {
    id: "ftmo_p1_100k",
    firm: "ftmo",
    firmDisplay: "FTMO",
    evalName: "Phase 1",
    displayName: "FTMO Phase 1 — $100K",
    startingCash: 100_000,
    profitTargetDollars: 10_000,
    dailyLossLimitDollars: 5_000,
    maxDrawdownDollars: 10_000,
    drawdownType: "static",
    trailingDdLockAtDollars: null,
    minTradingDays: 4,
    consistencyRulePct: null,
    noOvernight: false,
    color: "var(--color-phase1)",
    colorRgb: "59, 130, 246",
    description:
      "FTMO's first phase. +10% target, 5% daily loss, 10% total drawdown. Forex / indices / stocks.",
    rulesSummary: [
      "+$10,000 profit target (10%)",
      "Max $5,000 daily loss (5%)",
      "Max $10,000 total drawdown (10%, static)",
      "Min 4 trading days",
      "Overnight allowed",
    ],
  },
  ftmo_p2_100k: {
    id: "ftmo_p2_100k",
    firm: "ftmo",
    firmDisplay: "FTMO",
    evalName: "Phase 2",
    displayName: "FTMO Phase 2 — $100K",
    startingCash: 100_000,
    profitTargetDollars: 5_000,
    dailyLossLimitDollars: 5_000,
    maxDrawdownDollars: 10_000,
    drawdownType: "static",
    trailingDdLockAtDollars: null,
    minTradingDays: 4,
    consistencyRulePct: null,
    noOvernight: false,
    color: "var(--color-phase2)",
    colorRgb: "168, 85, 247",
    description: "FTMO verification round. Half the target, same loss limits.",
    rulesSummary: [
      "+$5,000 profit target (5%)",
      "Max $5,000 daily loss (5%)",
      "Max $10,000 total drawdown (10%, static)",
      "Min 4 trading days",
    ],
  },

  // ─────── Apex Trader Funding ───────
  apex_50k: {
    id: "apex_50k",
    firm: "apex",
    firmDisplay: "Apex",
    evalName: "$50K Eval",
    displayName: "Apex Trader Funding — $50K",
    startingCash: 50_000,
    profitTargetDollars: 3_000,
    dailyLossLimitDollars: null, // Apex has no daily loss limit on the eval
    maxDrawdownDollars: 2_500,
    drawdownType: "trailing",
    trailingDdLockAtDollars: 52_600, // locks once equity reaches start + target + $100 cushion
    minTradingDays: 7,
    consistencyRulePct: 30,
    noOvernight: true,
    color: "var(--color-pro)",
    colorRgb: "245, 158, 11",
    description:
      "Apex's $50K micros-only eval. Trailing $2,500 drawdown, 30% consistency rule, no overnight.",
    rulesSummary: [
      "+$3,000 profit target",
      "$2,500 trailing drawdown (until +$2,600 in profit, then locks)",
      "Min 7 trading days",
      "30% consistency rule",
      "No overnight holds",
      "No daily loss limit",
    ],
  },
  apex_100k: {
    id: "apex_100k",
    firm: "apex",
    firmDisplay: "Apex",
    evalName: "$100K Eval",
    displayName: "Apex Trader Funding — $100K",
    startingCash: 100_000,
    profitTargetDollars: 6_000,
    dailyLossLimitDollars: null,
    maxDrawdownDollars: 3_000,
    drawdownType: "trailing",
    trailingDdLockAtDollars: 103_100,
    minTradingDays: 7,
    consistencyRulePct: 30,
    noOvernight: true,
    color: "var(--color-pro)",
    colorRgb: "245, 158, 11",
    description: "Apex's $100K eval. Larger drawdown buffer, same trailing rules.",
    rulesSummary: [
      "+$6,000 profit target",
      "$3,000 trailing drawdown (locks at +$3,100)",
      "Min 7 trading days",
      "30% consistency rule",
      "No overnight holds",
    ],
  },

  // ─────── Topstep ───────
  topstep_50k: {
    id: "topstep_50k",
    firm: "topstep",
    firmDisplay: "Topstep",
    evalName: "$50K Combine",
    displayName: "Topstep $50K Combine",
    startingCash: 50_000,
    profitTargetDollars: 3_000,
    dailyLossLimitDollars: 1_000,
    maxDrawdownDollars: 2_000,
    drawdownType: "trailing",
    trailingDdLockAtDollars: 52_000, // locks once you reach start + profit target
    minTradingDays: 5,
    consistencyRulePct: null,
    noOvernight: false, // micros only — overnight is allowed but discouraged
    color: "var(--color-up)",
    colorRgb: "0, 227, 148",
    description: "Topstep's most popular combine. Strict daily loss + trailing drawdown.",
    rulesSummary: [
      "+$3,000 profit target",
      "Max $1,000 daily loss",
      "$2,000 trailing drawdown (locks at +$3,000 profit)",
      "Min 5 winning days at any size",
      "Micros only",
    ],
  },
  topstep_100k: {
    id: "topstep_100k",
    firm: "topstep",
    firmDisplay: "Topstep",
    evalName: "$100K Combine",
    displayName: "Topstep $100K Combine",
    startingCash: 100_000,
    profitTargetDollars: 6_000,
    dailyLossLimitDollars: 2_000,
    maxDrawdownDollars: 3_000,
    drawdownType: "trailing",
    trailingDdLockAtDollars: 103_000,
    minTradingDays: 5,
    consistencyRulePct: null,
    noOvernight: false,
    color: "var(--color-up)",
    colorRgb: "0, 227, 148",
    description: "Topstep $100K — bigger size, same discipline.",
    rulesSummary: [
      "+$6,000 profit target",
      "Max $2,000 daily loss",
      "$3,000 trailing drawdown",
      "Min 5 winning days",
    ],
  },

  // ─────── MyFundedFutures ───────
  mff_50k: {
    id: "mff_50k",
    firm: "mff",
    firmDisplay: "MyFundedFutures",
    evalName: "Starter $50K",
    displayName: "MyFundedFutures Starter — $50K",
    startingCash: 50_000,
    profitTargetDollars: 3_000,
    dailyLossLimitDollars: 1_200,
    maxDrawdownDollars: 2_000,
    drawdownType: "trailing",
    trailingDdLockAtDollars: 52_000,
    minTradingDays: 1,
    consistencyRulePct: null,
    noOvernight: false,
    color: "var(--color-elite)",
    colorRgb: "236, 72, 153",
    description: "MFFU $50K Starter. Easier daily loss but tight trailing.",
    rulesSummary: [
      "+$3,000 profit target",
      "Max $1,200 daily loss",
      "$2,000 trailing drawdown",
      "Min 1 trading day (no minimum days enforced)",
    ],
  },
};

export const FIRM_PROFILE_ORDER: string[] = [
  "ftmo_p1_100k",
  "ftmo_p2_100k",
  "topstep_50k",
  "topstep_100k",
  "apex_50k",
  "apex_100k",
  "mff_50k",
];

export function getFirmProfile(id: string | null | undefined): FirmProfileConfig | null {
  if (!id) return null;
  return FIRM_PROFILES[id] ?? null;
}
