import OpenAI from "openai";

let cachedClient: OpenAI | null = null;
function client() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

export type TradeScore = {
  score: number; // 1-10
  headline: string;
  insights: string[]; // 2-4 short bullet points
  flags: ("ok" | "warn" | "danger")[]; // parallel to insights
};

export type ScoreInput = {
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  notes: string | null;
  account: {
    tier: string;
    cash: number;
    startingCash: number;
    equity: number;
    dayPnl: number;
    dailyLossLimitPct: number | null;
    maxDrawdownPct: number | null;
    drawdownPct: number;
    tradingDaysCount: number;
    inCooldown: boolean;
  };
  recentTrades: Array<{
    ticker: string;
    side: string;
    realizedPnl: number | null;
    triggeredBy: string | null;
    minutesAgo: number;
  }>;
  todayTradesCount: number;
  todayWinRate: number | null; // 0-1, or null if no closed trades today
};

const SYSTEM = `You are an honest, direct trading-discipline coach for a funded-eval simulator.

Your job: given a proposed trade and the user's recent context, score it 1–10 on RISK DISCIPLINE.
- 10 = textbook discipline: clear stop, R/R ≥ 2:1, ≤1% account risk, sized correctly, not tilted
- 7–9 = mostly good with one issue
- 4–6 = mediocre — multiple discipline issues
- 1–3 = blowing up: no stop, oversize, post-loss tilt, breaking eval rules

You DO NOT comment on whether the stock will go up. You analyze the TRADE STRUCTURE only.
You are blunt and call out specific patterns. No filler. No hedging.

Output strict JSON matching this schema:
{
  "score": number 1-10,
  "headline": "8 words max — the verdict",
  "insights": ["short observation", ...],
  "flags": ["ok"|"warn"|"danger", ...]
}

Insights: 2-4 items, each <= 90 chars. Each insight has a paired flag.
- "ok" = positive (good R/R, good size)
- "warn" = caution (e.g. trading after a loss)
- "danger" = severe issue (no stop, account-killing size, eval rule violation)

Be honest, terse, useful. The user is here to get better — coddling makes them worse.`;

function buildUserPrompt(input: ScoreInput): string {
  const { ticker, side, shares, price, stopLoss, takeProfit, account, recentTrades, todayTradesCount, todayWinRate } = input;
  const total = shares * price;
  const accountRiskPct = stopLoss
    ? ((shares * (price - stopLoss)) / account.startingCash) * 100
    : null;
  const rr = stopLoss && takeProfit ? (takeProfit - price) / (price - stopLoss) : null;

  const tradeLine =
    `${side.toUpperCase()} ${shares} ${ticker} @ $${price.toFixed(2)} ` +
    `(total $${total.toFixed(2)})` +
    (stopLoss ? `, stop $${stopLoss.toFixed(2)}` : `, NO STOP`) +
    (takeProfit ? `, target $${takeProfit.toFixed(2)}` : ``);

  const recent = recentTrades.length
    ? recentTrades
        .slice(0, 5)
        .map(
          (t) =>
            `  ${t.minutesAgo}min ago: ${t.side.toUpperCase()} ${t.ticker}` +
            (t.realizedPnl != null
              ? ` (${t.realizedPnl >= 0 ? "+" : ""}$${t.realizedPnl.toFixed(0)})`
              : "") +
            (t.triggeredBy && t.triggeredBy !== "manual" ? ` [${t.triggeredBy}]` : "")
        )
        .join("\n")
    : "  none";

  return `PROPOSED TRADE:
${tradeLine}
${input.notes ? `User note: "${input.notes}"\n` : ""}

ACCOUNT:
  Tier: ${account.tier} ($${(account.startingCash / 1000).toFixed(0)}K paper account)
  Cash available: $${account.cash.toFixed(0)}
  Current equity: $${account.equity.toFixed(0)}
  Today's P&L: ${account.dayPnl >= 0 ? "+" : ""}$${account.dayPnl.toFixed(0)}
  Total drawdown so far: ${account.drawdownPct.toFixed(2)}%
  Eval rules: ${account.dailyLossLimitPct ? `daily loss ${account.dailyLossLimitPct}%, max DD ${account.maxDrawdownPct}%` : "none (Rookie)"}
  Trading days completed: ${account.tradingDaysCount}
  Currently in cooldown: ${account.inCooldown ? "YES" : "no"}

THIS TRADE:
  Account risk: ${accountRiskPct != null ? accountRiskPct.toFixed(2) + "%" : "UNDEFINED (no stop)"}
  R/R ratio: ${rr != null ? rr.toFixed(2) + ":1" : "UNDEFINED"}

TODAY:
  Trades placed: ${todayTradesCount}
  Win rate today: ${todayWinRate != null ? (todayWinRate * 100).toFixed(0) + "%" : "no closes yet"}

RECENT TRADES (last 5):
${recent}

Score this trade now. Return JSON only.`;
}

// =============================================================================
// EVAL COACH
// =============================================================================

export type EvalCoachOutput = {
  passProbability: number; // 0-100
  verdict: "on_track" | "at_risk" | "in_trouble" | "passed" | "failed";
  headline: string; // 12 words max
  mustDo: string[]; // 2-3 actions
  biggestRisks: string[]; // 1-2 risks
};

export type EvalCoachInput = {
  tier: string;
  startingCash: number;
  currentEquity: number;
  cashAvailable: number;
  drawdownPct: number;
  highWaterMark: number;
  rules: {
    profitTargetPct: number | null;
    dailyLossLimitPct: number | null;
    maxDrawdownPct: number | null;
    minTradingDays: number | null;
  };
  tradingDaysCount: number;
  tradesPlaced: number;
  closedTrades: number;
  winRate: number | null; // 0-1
  avgWinPct: number | null;
  avgLossPct: number | null;
  avgRR: number | null;
  largestSingleLossPct: number | null;
  daysSinceStart: number;
  status: "active" | "passed" | "failed";
};

const COACH_SYSTEM = `You are a funded-eval coach analyzing a paper trader's chance of passing their evaluation.

Real funded firms (FTMO, Apex, Topstep) charge $99–$1080 per attempt. Pass rates around 10%.
Most fail not from bad picks but from rule violations or undisciplined sizing.

Your job: estimate probability of passing this account's eval. Be quantitative and honest.

Consider:
- Profit target progress vs trading days remaining
- Drawdown headroom (how close to max DD)
- Win rate × avg R/R (expectancy) — projects forward
- Daily loss limit risk (volatility of recent days)
- Sample size (low N = high uncertainty)

Output strict JSON:
{
  "passProbability": 0-100 integer,
  "verdict": "on_track" | "at_risk" | "in_trouble" | "passed" | "failed",
  "headline": "12 words max — the verdict",
  "mustDo": ["specific action", ...],     // 2-3 actions, each <= 90 chars
  "biggestRisks": ["specific risk", ...]   // 1-2 risks, each <= 90 chars
}

Rules of thumb:
- 80%+ probability = "on_track"
- 50-79% = "at_risk"
- <50% = "in_trouble"
- Already passed/failed = match status

Be terse. No filler. Numbers > opinions.`;

function buildCoachPrompt(input: EvalCoachInput): string {
  const profitPct = ((input.currentEquity - input.startingCash) / input.startingCash) * 100;
  const targetGap = input.rules.profitTargetPct ? input.rules.profitTargetPct - profitPct : null;
  const ddHeadroom = input.rules.maxDrawdownPct
    ? input.rules.maxDrawdownPct - input.drawdownPct
    : null;
  const daysLeft = input.rules.minTradingDays
    ? Math.max(0, input.rules.minTradingDays - input.tradingDaysCount)
    : 0;

  return `ACCOUNT: ${input.tier} ($${(input.startingCash / 1000).toFixed(0)}K)
Status: ${input.status}
Days into eval: ${input.daysSinceStart}
Trading days completed: ${input.tradingDaysCount}${input.rules.minTradingDays ? ` / ${input.rules.minTradingDays} required` : ""}

PROFIT:
  Current: ${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}%
  Target: ${input.rules.profitTargetPct ? "+" + input.rules.profitTargetPct + "%" : "—"}
  Gap to target: ${targetGap != null ? (targetGap >= 0 ? "+" : "") + targetGap.toFixed(2) + "%" : "—"}

DRAWDOWN:
  Current: ${input.drawdownPct.toFixed(2)}%
  Limit: ${input.rules.maxDrawdownPct ? input.rules.maxDrawdownPct + "%" : "—"}
  Headroom remaining: ${ddHeadroom != null ? ddHeadroom.toFixed(2) + "%" : "—"}
  Daily loss limit: ${input.rules.dailyLossLimitPct ? input.rules.dailyLossLimitPct + "%" : "—"}

PERFORMANCE:
  Trades placed: ${input.tradesPlaced} (${input.closedTrades} closed)
  Win rate: ${input.winRate != null ? (input.winRate * 100).toFixed(0) + "%" : "n/a"}
  Avg winner: ${input.avgWinPct != null ? "+" + input.avgWinPct.toFixed(2) + "%" : "n/a"}
  Avg loser: ${input.avgLossPct != null ? input.avgLossPct.toFixed(2) + "%" : "n/a"}
  Avg R/R closed: ${input.avgRR != null ? input.avgRR.toFixed(2) : "n/a"}
  Worst single trade: ${input.largestSingleLossPct != null ? input.largestSingleLossPct.toFixed(2) + "%" : "n/a"}

REMAINING:
  Min trading days remaining: ${daysLeft}
  Cash available: $${input.cashAvailable.toFixed(0)} of $${input.startingCash.toFixed(0)}

Estimate pass probability and tell them what to do. Return JSON only.`;
}

export async function runEvalCoach(input: EvalCoachInput): Promise<EvalCoachOutput | null> {
  const oai = client();
  if (!oai) return null;

  // Skip if no rules (Rookie or Elite)
  if (
    input.rules.profitTargetPct == null &&
    input.rules.maxDrawdownPct == null &&
    input.rules.dailyLossLimitPct == null
  ) {
    return null;
  }

  // Pre-resolved cases
  if (input.status === "passed") {
    return {
      passProbability: 100,
      verdict: "passed",
      headline: "Eval passed. Lock it in.",
      mustDo: ["Spin up the next tier and apply the same discipline."],
      biggestRisks: [],
    };
  }
  if (input.status === "failed") {
    return {
      passProbability: 0,
      verdict: "failed",
      headline: "Eval failed. Review what broke.",
      mustDo: ["Read your trade history. Identify the rule violation pattern."],
      biggestRisks: [],
    };
  }

  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: COACH_SYSTEM },
        { role: "user", content: buildCoachPrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EvalCoachOutput;
    parsed.passProbability = Math.max(0, Math.min(100, Math.round(parsed.passProbability)));
    parsed.mustDo = (parsed.mustDo ?? []).slice(0, 3);
    parsed.biggestRisks = (parsed.biggestRisks ?? []).slice(0, 2);
    return parsed;
  } catch (e) {
    console.error("[brain] runEvalCoach error:", e);
    return null;
  }
}

// =============================================================================
// STRATEGY COACH — analyzes a single strategy's performance and gives feedback
// =============================================================================

export type StrategyCoachOutput = {
  verdict: "edge_confirmed" | "promising" | "no_edge_yet" | "drift" | "broken";
  headline: string;
  whatWorks: string[];
  whatToFix: string[];
  nextStep: string;
};

export type StrategyCoachInput = {
  strategy: {
    name: string;
    description: string | null;
    entryRules: string | null;
    exitRules: string | null;
    sizeRules: string | null;
    timeWindow: string | null;
    instruments: string[] | null;
  };
  stats: {
    totalTrades: number;
    closes: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    avgRR: number | null;
    expectancy: number | null;
    largestWin: number | null;
    largestLoss: number | null;
    totalRealized: number;
    trainingTrades: number;
  };
  recentTrades: Array<{
    ticker: string;
    side: string;
    realizedPnl: number | null;
    isTraining: boolean;
    notes: string | null;
    triggeredBy: string | null;
    timeOfDay: string; // hh:mm UTC
    dayOfWeek: string; // Mon, Tue...
    daysAgo: number;
  }>;
};

const STRATEGY_COACH_SYSTEM = `You are a hard-edged trading mentor analyzing one specific strategy a user has been running.

Your job: read the strategy's defined rules and the trades tagged to it. Tell them honestly:
1. Whether there's an edge yet (need 20+ trades to call confirmed)
2. What's working specifically (best setups, time-of-day, win conditions)
3. What's drifting from the rules (rule violations, post-loss tilt, oversize)
4. The single next step they should take

Be quantitative. Cite numbers from the data. Don't hedge with "may" or "consider" — be direct.
Don't recommend stock picks. Don't give entry signals. Analyze BEHAVIOR.

Verdicts:
- "edge_confirmed" — 20+ closed trades, profit factor > 1.5, expectancy positive
- "promising" — 10-19 trades, expectancy positive, looking good
- "no_edge_yet" — under 10 closed trades, can't tell
- "drift" — has trades but rule violations are visible (tagging non-strategy trades, wrong time, etc)
- "broken" — 20+ trades, expectancy negative, edge isn't there

Output strict JSON:
{
  "verdict": "...",
  "headline": "12 words max — the verdict",
  "whatWorks": ["specific observation with number", ...],  // 1-3 items, can be empty
  "whatToFix": ["specific issue with number", ...],         // 1-3 items, can be empty
  "nextStep": "One sentence — the single most important action"
}`;

function buildStrategyCoachPrompt(input: StrategyCoachInput): string {
  const s = input.strategy;
  const st = input.stats;

  const recent = input.recentTrades.length
    ? input.recentTrades
        .slice(0, 15)
        .map(
          (t) =>
            `  ${t.daysAgo}d ago, ${t.dayOfWeek} ${t.timeOfDay} — ${t.side.toUpperCase()} ${t.ticker}` +
            (t.realizedPnl != null
              ? ` (${t.realizedPnl >= 0 ? "+" : ""}$${t.realizedPnl.toFixed(0)})`
              : "") +
            (t.isTraining ? " [training]" : "") +
            (t.triggeredBy && t.triggeredBy !== "manual" ? ` [${t.triggeredBy}]` : "") +
            (t.notes ? ` "${t.notes.slice(0, 60)}"` : "")
        )
        .join("\n")
    : "  none";

  return `STRATEGY: ${s.name}
${s.description ? `Description: ${s.description}` : ""}

DEFINED RULES:
  Entry: ${s.entryRules ?? "(not set)"}
  Exit: ${s.exitRules ?? "(not set)"}
  Sizing: ${s.sizeRules ?? "(not set)"}
  Time window: ${s.timeWindow ?? "(any)"}
  Instruments: ${s.instruments?.join(", ") ?? "(any)"}

PERFORMANCE:
  Total trades tagged: ${st.totalTrades} (${st.trainingTrades} were training-mode)
  Closed (with realized P&L): ${st.closes}
  Wins: ${st.wins}, Losses: ${st.losses}
  Win rate: ${st.winRate != null ? (st.winRate * 100).toFixed(0) + "%" : "n/a"}
  Avg winner: ${st.avgWin != null ? "$" + st.avgWin.toFixed(2) : "n/a"}
  Avg loser: ${st.avgLoss != null ? "$" + st.avgLoss.toFixed(2) : "n/a"}
  Avg R/R: ${st.avgRR != null ? st.avgRR.toFixed(2) + ":1" : "n/a"}
  Expectancy: ${st.expectancy != null ? "$" + st.expectancy.toFixed(2) + "/trade" : "n/a"}
  Largest win: ${st.largestWin != null ? "$" + st.largestWin.toFixed(2) : "n/a"}
  Largest loss: ${st.largestLoss != null ? "$" + st.largestLoss.toFixed(2) : "n/a"}
  Total realized: ${st.totalRealized >= 0 ? "+" : ""}$${st.totalRealized.toFixed(2)}

RECENT TRADES (last 15):
${recent}

Analyze. Return JSON only.`;
}

export async function runStrategyCoach(
  input: StrategyCoachInput
): Promise<StrategyCoachOutput | null> {
  const oai = client();
  if (!oai) return null;

  if (input.stats.totalTrades === 0) {
    return {
      verdict: "no_edge_yet",
      headline: "No tagged trades yet. Take 5–10 to start the analysis.",
      whatWorks: [],
      whatToFix: [],
      nextStep: "Tag your next trade with this strategy on the trade ticket.",
    };
  }

  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: STRATEGY_COACH_SYSTEM },
        { role: "user", content: buildStrategyCoachPrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 600,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StrategyCoachOutput;
    parsed.whatWorks = (parsed.whatWorks ?? []).slice(0, 3);
    parsed.whatToFix = (parsed.whatToFix ?? []).slice(0, 3);
    return parsed;
  } catch (e) {
    console.error("[brain] runStrategyCoach error:", e);
    return null;
  }
}

export async function scoreTrade(input: ScoreInput): Promise<TradeScore | null> {
  const oai = client();
  if (!oai) return null;

  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 400,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradeScore;
    // Sanity clamp
    parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score)));
    parsed.insights = (parsed.insights ?? []).slice(0, 4);
    parsed.flags = (parsed.flags ?? []).slice(0, 4);
    while (parsed.flags.length < parsed.insights.length) parsed.flags.push("warn");
    return parsed;
  } catch (e) {
    console.error("[brain] scoreTrade error:", e);
    return null;
  }
}
