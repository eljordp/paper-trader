import OpenAI from "openai";
import type { Candle } from "./yahoo";

let cachedClient: OpenAI | null = null;
function client() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

export type EntryRule =
  | { type: "price_drop"; magnitude_pct: number; lookback_minutes: number }
  | { type: "price_pop"; magnitude_pct: number; lookback_minutes: number }
  | { type: "breakout_above"; lookback_bars: number }
  | { type: "breakdown_below"; lookback_bars: number }
  | { type: "rsi_below"; threshold: number; period: number }
  | { type: "rsi_above"; threshold: number; period: number }
  | { type: "ma_cross_up"; fast_period: number; slow_period: number }
  | { type: "ma_cross_down"; fast_period: number; slow_period: number };

export type ExitRule = {
  stop_loss_pct: number;
  take_profit_pct: number;
  time_exit_bars?: number;
};

export type StrategySide = "long" | "short";

export type StrategyRules = {
  side: StrategySide;
  entry: EntryRule;
  exit: ExitRule;
  time_window_utc?: [number, number];
};

export type ProposedStrategy = {
  name: string;
  hypothesis: string;
  instruments: string[];
  rules: StrategyRules;
};

const GENERATION_SYSTEM = `You are a quantitative strategy designer. Given today's market state and recent news, propose 5 SPECIFIC, BACKTESTABLE trading hypotheses.

Each hypothesis must include:
- A name (5 words max)
- A clear thesis (one sentence — what edge are you trying to capture?)
- Instruments (1-3 tickers — prefer liquid ETFs/large-caps: SPY, QQQ, IWM, AAPL, NVDA, TSLA, AMZN, MSFT, GOOG, META; or futures: NQ=F, ES=F, MES=F, MNQ=F)
- Structured rules (entry + exit) using ONLY these primitive types:
  * price_drop / price_pop: triggers on % move over N minutes
  * breakout_above / breakdown_below: triggers when price closes above/below the N-bar high/low
  * rsi_below / rsi_above: triggers when RSI(period) crosses threshold
  * ma_cross_up / ma_cross_down: triggers when fast MA crosses slow MA

Output STRICT JSON, exactly this shape:
{
  "strategies": [
    {
      "name": "Tech selloff bounce",
      "hypothesis": "After QQQ drops 1.5% in 30 min, mean reversion bounce within the hour.",
      "instruments": ["QQQ"],
      "rules": {
        "side": "long",
        "entry": { "type": "price_drop", "magnitude_pct": -1.5, "lookback_minutes": 30 },
        "exit": { "stop_loss_pct": -1.0, "take_profit_pct": 2.0, "time_exit_bars": 60 },
        "time_window_utc": [13, 19]
      }
    }
  ]
}

Be specific and testable. No vague rules. No "if news is bullish" — only structural conditions.`;

export type GenerationContext = {
  todayDate: string;
  userTier: string;
  recentHeadlines: Array<{ title: string; tickers: string[]; minutesAgo: number }>;
  marketState: { spyPct: number | null; qqqPct: number | null; vixLevel: number | null };
};

export async function generateHypotheses(ctx: GenerationContext): Promise<ProposedStrategy[]> {
  const oai = client();
  if (!oai) return [];
  const prompt = `Date: ${ctx.todayDate}
Account tier: ${ctx.userTier}

MARKET STATE TODAY:
  SPY: ${ctx.marketState.spyPct != null ? (ctx.marketState.spyPct >= 0 ? "+" : "") + ctx.marketState.spyPct.toFixed(2) + "%" : "n/a"}
  QQQ: ${ctx.marketState.qqqPct != null ? (ctx.marketState.qqqPct >= 0 ? "+" : "") + ctx.marketState.qqqPct.toFixed(2) + "%" : "n/a"}
  VIX: ${ctx.marketState.vixLevel != null ? ctx.marketState.vixLevel.toFixed(1) : "n/a"}

RECENT HEADLINES:
${ctx.recentHeadlines.slice(0, 8).map((h, i) => `  ${i + 1}. [${h.minutesAgo}m ago] ${h.title} ${h.tickers.length ? "(" + h.tickers.join(", ") + ")" : ""}`).join("\n")}

Propose 5 strategies. Return JSON only.`;
  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: GENERATION_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { strategies?: ProposedStrategy[] };
    return (parsed.strategies ?? []).slice(0, 5);
  } catch (e) {
    console.error("[ai-lab] generateHypotheses error:", e);
    return [];
  }
}

const DISCOVERY_SYSTEM = `You are a trading strategy archaeologist. Given a user's recent trade history with outcomes, your job is to extract the implicit RULES that produced their winners and losers, then codify the winning patterns into reusable, backtestable strategies.

Look for time-of-day patterns, ticker concentration, hold time, direction bias, R/R, post-loss tilt.

Output 3 strategies that codify what HAS WORKED for THIS user, in the same JSON format used for generation.

If the user has fewer than 10 closed trades, output an empty strategies array.

JSON shape:
{
  "strategies": [
    {
      "name": "Morning gap reclaim",
      "hypothesis": "User wins 7/10 longs taken 9:30-10:30am on QQQ after a -0.5% open. Codifying.",
      "instruments": ["QQQ"],
      "rules": { "side": "long", "entry": {...}, "exit": {...}, "time_window_utc": [13, 15] }
    }
  ]
}`;

export type DiscoveryContext = {
  trades: Array<{
    ticker: string;
    side: "buy" | "sell" | "short" | "cover";
    realizedPnl: number | null;
    entryTime: string;
    exitTime: string | null;
    notes: string | null;
    triggeredBy: string | null;
    instrumentType: string;
  }>;
};

export async function discoverFromTrades(ctx: DiscoveryContext): Promise<ProposedStrategy[]> {
  const oai = client();
  if (!oai) return [];
  if (ctx.trades.length < 10) return [];
  const summary = ctx.trades.slice(0, 50).map((t) => {
    const d = new Date(t.entryTime);
    const time = `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")} UTC`;
    return `  ${time} ${t.side.toUpperCase()} ${t.ticker} ${t.realizedPnl != null ? (t.realizedPnl >= 0 ? "+" : "") + "$" + t.realizedPnl.toFixed(0) : "(open)"}${t.notes ? ` "${t.notes.slice(0, 50)}"` : ""}${t.triggeredBy && t.triggeredBy !== "manual" ? ` [${t.triggeredBy}]` : ""}`;
  }).join("\n");
  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: DISCOVERY_SYSTEM },
        { role: "user", content: `RECENT TRADES (most recent first):\n${summary}\n\nExtract patterns. Return JSON only.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1500,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { strategies?: ProposedStrategy[] };
    return (parsed.strategies ?? []).slice(0, 3);
  } catch (e) {
    console.error("[ai-lab] discoverFromTrades error:", e);
    return [];
  }
}

export type BacktestResult = {
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  totalReturnPct: number;
  expectancyPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgRR: number;
  periodStart: string;
  periodEnd: string;
  candleInterval: string;
};

function computeRSI(closes: number[], period: number): (number | null)[] {
  const rsi: (number | null)[] = [];
  if (closes.length < period + 1) return closes.map(() => null);
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gainSum += diff; else lossSum -= diff;
    rsi.push(null);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  while (rsi.length < closes.length) rsi.unshift(null);
  return rsi;
}

function computeSMA(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    out.push(sum / period);
  }
  return out;
}

function entryConditionMet(rule: EntryRule, candles: Candle[], i: number, rsiSeries: (number | null)[], smaFast?: (number | null)[], smaSlow?: (number | null)[]): boolean {
  const c = candles[i];
  switch (rule.type) {
    case "price_drop": {
      const lookbackBars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - lookbackBars];
      if (!past) return false;
      const pct = ((c.close - past.close) / past.close) * 100;
      return pct <= rule.magnitude_pct;
    }
    case "price_pop": {
      const lookbackBars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - lookbackBars];
      if (!past) return false;
      const pct = ((c.close - past.close) / past.close) * 100;
      return pct >= rule.magnitude_pct;
    }
    case "breakout_above": {
      if (i < rule.lookback_bars) return false;
      let high = -Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++) if (candles[j].high > high) high = candles[j].high;
      return c.close > high && candles[i - 1].close <= high;
    }
    case "breakdown_below": {
      if (i < rule.lookback_bars) return false;
      let low = Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++) if (candles[j].low < low) low = candles[j].low;
      return c.close < low && candles[i - 1].close >= low;
    }
    case "rsi_below": {
      const r = rsiSeries[i], prev = rsiSeries[i - 1];
      if (r == null || prev == null) return false;
      return r < rule.threshold && prev >= rule.threshold;
    }
    case "rsi_above": {
      const r = rsiSeries[i], prev = rsiSeries[i - 1];
      if (r == null || prev == null) return false;
      return r > rule.threshold && prev <= rule.threshold;
    }
    case "ma_cross_up": {
      if (!smaFast || !smaSlow) return false;
      const fNow = smaFast[i], sNow = smaSlow[i], fPrev = smaFast[i - 1], sPrev = smaSlow[i - 1];
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) return false;
      return fNow > sNow && fPrev <= sPrev;
    }
    case "ma_cross_down": {
      if (!smaFast || !smaSlow) return false;
      const fNow = smaFast[i], sNow = smaSlow[i], fPrev = smaFast[i - 1], sPrev = smaSlow[i - 1];
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) return false;
      return fNow < sNow && fPrev >= sPrev;
    }
  }
}

export function backtest(rules: StrategyRules, candlesByTicker: Record<string, Candle[]>, candleInterval = "5m"): BacktestResult | null {
  const allTrades: Array<{ pnlPct: number }> = [];
  let earliestTime = Infinity, latestTime = -Infinity;
  for (const ticker of Object.keys(candlesByTicker)) {
    const candles = candlesByTicker[ticker];
    if (candles.length < 50) continue;
    earliestTime = Math.min(earliestTime, candles[0].time);
    latestTime = Math.max(latestTime, candles[candles.length - 1].time);
    const closes = candles.map((c) => c.close);
    let rsiSeries: (number | null)[] = [];
    let smaFast: (number | null)[] | undefined;
    let smaSlow: (number | null)[] | undefined;
    if (rules.entry.type === "rsi_below" || rules.entry.type === "rsi_above") rsiSeries = computeRSI(closes, rules.entry.period);
    if (rules.entry.type === "ma_cross_up" || rules.entry.type === "ma_cross_down") {
      smaFast = computeSMA(closes, rules.entry.fast_period);
      smaSlow = computeSMA(closes, rules.entry.slow_period);
    }
    let i = Math.max(20, rules.entry.type === "rsi_below" || rules.entry.type === "rsi_above" ? rules.entry.period + 1 : 0);
    while (i < candles.length - 1) {
      if (rules.time_window_utc) {
        const hr = new Date(candles[i].time * 1000).getUTCHours();
        const [start, end] = rules.time_window_utc;
        if (hr < start || hr >= end) { i++; continue; }
      }
      if (!entryConditionMet(rules.entry, candles, i, rsiSeries, smaFast, smaSlow)) { i++; continue; }
      const entryPrice = candles[i].close;
      const stopPrice = rules.side === "long" ? entryPrice * (1 + rules.exit.stop_loss_pct / 100) : entryPrice * (1 - rules.exit.stop_loss_pct / 100);
      const targetPrice = rules.side === "long" ? entryPrice * (1 + rules.exit.take_profit_pct / 100) : entryPrice * (1 - rules.exit.take_profit_pct / 100);
      const maxBars = rules.exit.time_exit_bars ?? 240;
      let exitPrice = entryPrice, exitIdx = i + 1, exited = false;
      for (let j = i + 1; j < Math.min(candles.length, i + 1 + maxBars); j++) {
        const c = candles[j];
        if (rules.side === "long") {
          if (c.low <= stopPrice) { exitPrice = stopPrice; exitIdx = j; exited = true; break; }
          if (c.high >= targetPrice) { exitPrice = targetPrice; exitIdx = j; exited = true; break; }
        } else {
          if (c.high >= stopPrice) { exitPrice = stopPrice; exitIdx = j; exited = true; break; }
          if (c.low <= targetPrice) { exitPrice = targetPrice; exitIdx = j; exited = true; break; }
        }
      }
      if (!exited) { const lastIdx = Math.min(candles.length - 1, i + maxBars); exitPrice = candles[lastIdx].close; exitIdx = lastIdx; }
      const pnlPct = rules.side === "long" ? ((exitPrice - entryPrice) / entryPrice) * 100 : ((entryPrice - exitPrice) / entryPrice) * 100;
      allTrades.push({ pnlPct });
      i = exitIdx + 1;
    }
  }
  if (allTrades.length === 0) {
    return { sampleSize: 0, wins: 0, losses: 0, winRate: 0, avgWinPct: 0, avgLossPct: 0, totalReturnPct: 0, expectancyPct: 0, profitFactor: 0, maxDrawdownPct: 0, avgRR: 0, periodStart: earliestTime !== Infinity ? new Date(earliestTime * 1000).toISOString() : "", periodEnd: latestTime !== -Infinity ? new Date(latestTime * 1000).toISOString() : "", candleInterval };
  }
  const wins = allTrades.filter((t) => t.pnlPct > 0);
  const losses = allTrades.filter((t) => t.pnlPct < 0);
  const winRate = wins.length / allTrades.length;
  const avgWinPct = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;
  const totalReturnPct = allTrades.reduce((a, t) => a + t.pnlPct, 0);
  const expectancyPct = totalReturnPct / allTrades.length;
  const profitFactor = losses.length === 0 ? (wins.length === 0 ? 0 : Infinity) : Math.abs(wins.reduce((a, t) => a + t.pnlPct, 0) / losses.reduce((a, t) => a + t.pnlPct, 0));
  let equity = 0, peak = 0, maxDD = 0;
  for (const t of allTrades) { equity += t.pnlPct; if (equity > peak) peak = equity; const dd = peak - equity; if (dd > maxDD) maxDD = dd; }
  return { sampleSize: allTrades.length, wins: wins.length, losses: losses.length, winRate, avgWinPct, avgLossPct, totalReturnPct, expectancyPct, profitFactor, maxDrawdownPct: maxDD, avgRR: avgLossPct !== 0 ? Math.abs(avgWinPct / avgLossPct) : 0, periodStart: earliestTime !== Infinity ? new Date(earliestTime * 1000).toISOString() : "", periodEnd: latestTime !== -Infinity ? new Date(latestTime * 1000).toISOString() : "", candleInterval };
}
