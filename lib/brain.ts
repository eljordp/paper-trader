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
