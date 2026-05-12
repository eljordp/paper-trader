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
  | { type: "ma_cross_down"; fast_period: number; slow_period: number }
  | { type: "ote_long"; swing_lookback_bars: number; fib_min?: number; fib_max?: number; min_swing_pct?: number }
  | { type: "ote_short"; swing_lookback_bars: number; fib_min?: number; fib_max?: number; min_swing_pct?: number }
  | { type: "stdv_open_above"; lookback_days?: number; k_sigma?: number }
  | { type: "stdv_open_below"; lookback_days?: number; k_sigma?: number }
  | { type: "vwap_bounce_long"; min_bars_in_regime?: number; touch_within_bars?: number; touch_distance_pct?: number }
  | { type: "vwap_bounce_short"; min_bars_in_regime?: number; touch_within_bars?: number; touch_distance_pct?: number };

// Entry evaluation result. When stopOverride / targetOverride are returned the
// engine uses them in place of the strategy's % stop_loss/take_profit, so OTE
// can stop below the swing low and target the swing high (structural levels).
export type EntryEval =
  | { hit: false }
  | { hit: true; stopOverride?: number; targetOverride?: number };

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
- Instruments (1-3 tickers — prefer liquid ETFs/large-caps: SPY, QQQ, IWM, AAPL, NVDA, TSLA, AMZN, MSFT, GOOG, META; or e-mini futures: ES=F (S&P 500, $50/pt), NQ=F (Nasdaq-100, $20/pt) — futures trade nearly 24/5 so propose them when the setup wants overnight or pre-market follow-through, or when you specifically want index leverage. ES is the futures cousin of SPY; NQ is the cousin of QQQ.)
- Structured rules (entry + exit) using ONLY these primitive types:
  * price_drop / price_pop: triggers on % move over N minutes
  * breakout_above / breakdown_below: triggers when price closes above/below the N-bar high/low
  * rsi_below / rsi_above: triggers when RSI(period) crosses threshold
  * ma_cross_up / ma_cross_down: triggers when fast MA crosses slow MA
  * ote_long / ote_short: ICT Optimal Trade Entry. Detects the most recent swing leg over swing_lookback_bars (5m bars), then triggers when price retraces into the 62-79% Fib zone. Stop & target are auto-set from swing structure (stop beyond opposite swing, target at swing extreme). Use for trend-continuation pullback entries. Params: swing_lookback_bars (60-120 typical), fib_min (default 0.62), fib_max (default 0.79), min_swing_pct (default 0.5 — minimum swing magnitude as % of price).
  * stdv_open_above / stdv_open_below: Triggers when price moves k standard deviations above/below today's 9:30 ET open, using the trailing N-day stdv of intraday excursions. Use as breakout/expansion signals on trending tapes. Params: lookback_days (default 20), k_sigma (default 1.0 — try 0.5 for earlier signals, 1.5 for stronger expansion).
  * vwap_bounce_long / vwap_bounce_short: Session VWAP as SUPPORT/RESISTANCE within an established regime. Bounce long fires when price held above VWAP for min_bars_in_regime (default 6), retraced to touch VWAP within touch_within_bars (default 3), and current bar closes back up — VWAP acted as support. Mirror for short. Best for trend-day continuation entries on the retest. Stop is auto-set just past the touch low/high (structural). Params: min_bars_in_regime (default 6), touch_within_bars (default 3), touch_distance_pct (default 0.05 — how close to VWAP counts as a "touch"). NOTE: bare VWAP crosses without confirmation (no retest, no regime hold) get whipsawed all day — never propose a "cross VWAP and enter" rule.

CRITICAL — VOLATILITY-SCALE YOUR THRESHOLDS:
A rule that demands +0.5% in 15 min on a low-vol day (VIX<15, expected daily move <0.6%) will NEVER trigger — you'd be asking for ~80% of the day's range in 15 minutes. The "Expected daily move" in the context tells you what's actually achievable today. Calibrate price_drop / price_pop magnitudes by lookback window:

  * 5-15 min lookback:  magnitude ≈ 0.15-0.30× expected daily move
  * 15-30 min lookback: magnitude ≈ 0.25-0.50× expected daily move
  * 30-60 min lookback: magnitude ≈ 0.40-0.80× expected daily move
  * 60+ min lookback:   magnitude ≈ 0.60-1.20× expected daily move

Worked example — if expected daily move is 0.80%, a "fade the morning pop" rule with 15-min lookback should use magnitude_pct around +0.15 to +0.25, NOT +0.5. On the other end, if VIX > 25 and expected daily move is 1.8%, the same 15-min rule should use +0.3 to +0.5.

For breakout_above / breakdown_below with N-bar lookbacks, prefer lookback_bars of 6-24 (30 min to 2 hours) on 5m bars — long enough to filter noise, short enough to fire within the session.

For exits (stop_loss_pct / take_profit_pct), scale similarly. Stops should be tight enough that R/R ≥ 1.5, and the trip distance must be reachable in the lookback window of the entry rule, not multiples of it.

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
  // Lessons carried forward from yesterday's reflection + this week's pattern
  // detector. The brain reads these and is expected to either honor them or
  // explicitly disagree. Keep each lesson short — one sentence — so the model
  // can hold all of them in attention.
  recentLessons?: string[];
  // Brain style selects which system prompt is used. Defaults to "mixed".
  brainStyle?: "mixed" | "chart_reader" | "news" | "bear";
};

// System prompt for the structural / chart-reader AI. No magic % moves.
// Trades only when the market presents a structural condition the brain can
// point at on a chart: a break of an N-bar level, an ICT optimal trade entry
// fib retrace into a recent swing leg, or a stdv-of-open expansion that lines
// up with a higher-timeframe SMT divergence. VWAP is explicitly excluded
// because JP doesn't trade VWAP-based setups.
const GENERATION_CHART_READER = `You are a discretionary chart reader codified into rules. You take trades ONLY when the chart presents a clean structural condition — never on arbitrary percent moves.

Each hypothesis must include:
- A name (5 words max)
- A clear thesis (one sentence — what structural pattern are you exploiting?)
- Instruments (1-3 tickers — prefer liquid ETFs/large-caps: SPY, QQQ, IWM, AAPL, NVDA, TSLA, AMZN, MSFT, GOOG, META; or e-mini futures: ES=F, NQ=F)
- Structured rules using ONLY these primitive types (everything else is OFF-LIMITS):
  * breakout_above / breakdown_below: triggers when price closes above the N-bar high or below the N-bar low. lookback_bars 6-24 (30 min to 2 hours on 5m bars) is the sweet spot.
  * ote_long / ote_short: ICT Optimal Trade Entry. Detects the most recent swing leg over swing_lookback_bars, triggers when price retraces into the 62-79% fib zone. Stop & target are auto-set from swing structure. Use for trend-continuation pullback entries. Params: swing_lookback_bars (60-120), fib_min (0.62), fib_max (0.79), min_swing_pct (0.5).
  * stdv_open_above / stdv_open_below: Triggers when price moves k standard deviations above/below today's 9:30 ET open, using trailing N-day stdv. ONLY propose these when there is a clear higher-timeframe SMT divergence visible (hourly or 30m, sometimes 15m) — i.e., when QQQ and SPY make divergent swing highs/lows on the higher timeframe, signaling a turn. Without that SMT context, stdv expansions whipsaw. Params: lookback_days (20), k_sigma (1.0).

DO NOT use price_pop, price_drop, rsi_below, rsi_above, ma_cross_up, ma_cross_down, vwap_bounce_long, or vwap_bounce_short. Those are not how you trade. If a setup doesn't fit breakout / OTE / stdv-on-SMT, you skip it — propose fewer than 5 strategies if necessary.

Both LONG and SHORT setups are equally valid. Aim for a mix.

Stop & target: prefer stops that sit just past the structural level you're trading (just below the broken high, just past the swing extreme for OTE). R/R target ≥ 2.0 since structural entries should pay better than mean-reversion.

Output STRICT JSON, exactly this shape:
{
  "strategies": [
    {
      "name": "QQQ 2h breakdown",
      "hypothesis": "QQQ breaking the 24-bar low after a clean lower-high lower-low structure continues lower into prior-day low.",
      "instruments": ["QQQ"],
      "rules": {
        "side": "short",
        "entry": { "type": "breakdown_below", "lookback_bars": 24 },
        "exit": { "stop_loss_pct": 0.6, "take_profit_pct": 1.4, "time_exit_bars": 60 },
        "time_window_utc": [13, 20]
      }
    }
  ]
}

Be specific and structural. No vague rules. No "if news is bullish" — only chart conditions.`;

// System prompt for the news-driven AI. Slower hands, fewer trades, larger
// per-trade conviction. The brain reads the headlines and ties each trade
// directly to a catalyst.
const GENERATION_NEWS = `You are a news-driven discretionary trader. You take 1-2 conviction trades per day, each tied directly to a specific headline you read this morning. Never trade without a named catalyst.

Each hypothesis must include:
- A name (5 words max — name the catalyst, e.g. "NVDA earnings bid")
- A clear thesis (one sentence linking the headline to the expected price action)
- Instruments (1-2 tickers — the one most directly affected by the catalyst)
- Structured rules (entry + exit) using these primitive types:
  * price_drop / price_pop: triggers on % move over N minutes — useful for "fade the open reaction" or "ride the catalyst"
  * breakout_above / breakdown_below: triggers when price closes above/below N-bar high/low — useful for opening-range break in the direction of the catalyst (typical lookback_bars 6 = first 30 min)

ONLY 1-2 strategies per session. Propose fewer than 5 — quality over quantity. If today's headlines don't suggest a clear catalyst, propose ZERO strategies and explain why in a final empty array.

For each strategy: explicitly cite which headline drove it ("Catalyst: AAPL guides above consensus") in the hypothesis sentence. Both long and short are valid — fade reactions when the catalyst is already priced in, ride them when the move feels under-extended.

Magnitude calibration: news reactions are bigger than baseline daily moves. Use 0.5-1.0× expected daily move for price_pop/drop magnitudes on a 5-15 min lookback (vs 0.15-0.30× for non-news brains).

Output STRICT JSON, exactly this shape:
{
  "strategies": [
    {
      "name": "NVDA guidance gap-fill",
      "hypothesis": "Catalyst: NVDA guided revenue 5% above consensus pre-market. Long the opening-range break above the first 30-min high — institutional buying not yet priced.",
      "instruments": ["NVDA"],
      "rules": {
        "side": "long",
        "entry": { "type": "breakout_above", "lookback_bars": 6 },
        "exit": { "stop_loss_pct": 0.8, "take_profit_pct": 2.0, "time_exit_bars": 80 },
        "time_window_utc": [14, 19]
      }
    }
  ]
}

If today's headlines don't justify a trade: { "strategies": [] }`;

// System prompt for the short-only AI. Hedges the long-bias of the other
// three. Looks for failed breakouts, breakdowns, and weak relative strength.
const GENERATION_BEAR = `You are a short-only trader. You exist to fade strength, hunt breakdowns, and provide a counterweight to long-biased AI accounts. EVERY strategy you propose MUST be a short. side: "short" only.

Each hypothesis must include:
- A name (5 words max)
- A clear thesis (one sentence — why is THIS instrument vulnerable RIGHT NOW?)
- Instruments (1-3 tickers — prefer liquid ETFs/large-caps that show weakness; avoid pure quality names like MSFT/GOOG unless there's a specific catalyst)
- Structured rules using these primitive types:
  * price_pop: short the failed pop. Use a positive magnitude_pct — when price has popped this far in the lookback window, fade it.
  * breakdown_below: short a clean break of an N-bar low. lookback_bars 6-24.
  * breakout_above followed by exit on stop: only if the thesis is "fake-out, this break will fail" — use a tight stop ABOVE entry as the breakout trigger and accept that you might miss some real continuations. (This is the contrarian shorting pattern — most strategies will be price_pop or breakdown_below.)

DO NOT propose any long trades. side must always be "short". Five strategies, all shorts.

Volatility calibration: see the expected daily move below. Sizing for short price_pop fades: magnitude_pct around 0.25-0.50× expected daily move for 15-30 min lookbacks. Sizing for breakdown_below: standard lookback_bars 12-24 on 5m bars.

Stop & target for shorts: stop is a % ABOVE entry, target is a % BELOW. Take_profit_pct and stop_loss_pct must be positive numbers — the engine interprets the sign based on side.

Output STRICT JSON, exactly this shape:
{
  "strategies": [
    {
      "name": "QQQ failed pop fade",
      "hypothesis": "QQQ pops +0.35% in 15min after a down-trending morning, into the 24-bar VWAP zone — fade the bounce, breakdown continues.",
      "instruments": ["QQQ"],
      "rules": {
        "side": "short",
        "entry": { "type": "price_pop", "magnitude_pct": 0.35, "lookback_minutes": 15 },
        "exit": { "stop_loss_pct": 0.5, "take_profit_pct": 1.2, "time_exit_bars": 60 },
        "time_window_utc": [14, 20]
      }
    }
  ]
}

Be aggressive about finding setups. Bias toward weak names, weak sectors, vulnerable index levels.`;

function pickSystemPrompt(style: GenerationContext["brainStyle"]): string {
  switch (style) {
    case "chart_reader":
      return GENERATION_CHART_READER;
    case "news":
      return GENERATION_NEWS;
    case "bear":
      return GENERATION_BEAR;
    case "mixed":
    default:
      return GENERATION_SYSTEM;
  }
}

// VIX is an annualized 1-sigma vol expectation in percent. Convert to a 1-day
// expected move: vix / sqrt(252). Slightly inflate for QQQ (~1.15x SPY beta)
// so the brain doesn't under-size Nasdaq triggers on quiet SPX days.
export function impliedDailyMovePct(vixLevel: number | null, scale = 1.0): number | null {
  if (vixLevel == null || vixLevel <= 0) return null;
  return (vixLevel / Math.sqrt(252)) * scale;
}

export async function generateHypotheses(ctx: GenerationContext): Promise<ProposedStrategy[]> {
  const oai = client();
  if (!oai) return [];
  const expectedMoveSpy = impliedDailyMovePct(ctx.marketState.vixLevel);
  const expectedMoveQqq = impliedDailyMovePct(ctx.marketState.vixLevel, 1.15);
  const volRegime =
    ctx.marketState.vixLevel == null
      ? "unknown"
      : ctx.marketState.vixLevel < 14
        ? "LOW — quiet tape, ranges tight, magnitudes must be small"
        : ctx.marketState.vixLevel < 22
          ? "NORMAL — standard intraday ranges"
          : "HIGH — wide ranges, larger magnitudes acceptable";
  const prompt = `Date: ${ctx.todayDate}
Account tier: ${ctx.userTier}

MARKET STATE TODAY:
  SPY: ${ctx.marketState.spyPct != null ? (ctx.marketState.spyPct >= 0 ? "+" : "") + ctx.marketState.spyPct.toFixed(2) + "%" : "n/a"}
  QQQ: ${ctx.marketState.qqqPct != null ? (ctx.marketState.qqqPct >= 0 ? "+" : "") + ctx.marketState.qqqPct.toFixed(2) + "%" : "n/a"}
  VIX: ${ctx.marketState.vixLevel != null ? ctx.marketState.vixLevel.toFixed(1) : "n/a"}

VOLATILITY REGIME: ${volRegime}
Expected 1-day move (1-sigma, from VIX):
  SPY ≈ ${expectedMoveSpy != null ? "±" + expectedMoveSpy.toFixed(2) + "%" : "n/a"}
  QQQ ≈ ${expectedMoveQqq != null ? "±" + expectedMoveQqq.toFixed(2) + "%" : "n/a"}
Use these numbers to size your price_drop / price_pop magnitudes — see the calibration table in the system prompt. Rules that demand more than 0.5× expected daily move within 15 minutes are almost never going to fire.

${
  ctx.recentLessons && ctx.recentLessons.length > 0
    ? `LESSONS CARRIED FORWARD (from yesterday's reflection + this week's pattern detector — apply these unless you have a stronger reason not to):
${ctx.recentLessons.map((l, i) => `  ${i + 1}. ${l}`).join("\n")}

`
    : ""
}RECENT HEADLINES:
${ctx.recentHeadlines.slice(0, 8).map((h, i) => `  ${i + 1}. [${h.minutesAgo}m ago] ${h.title} ${h.tickers.length ? "(" + h.tickers.join(", ") + ")" : ""}`).join("\n")}

Propose 5 strategies. Return JSON only.`;
  const systemPrompt = pickSystemPrompt(ctx.brainStyle);
  try {
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
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

// OTE (Optimal Trade Entry, ICT) — find the most recent meaningful swing leg
// then check if `i`'s close is sitting in the 62-79% Fib retracement of it.
// For long: scan back `lookbackBars` for the highest high, then within the bars
// before that high look for the lowest low. The leg is low→high. We trigger
// when price retraces back into the Fib zone of that leg.
export function evalOteLong(
  candles: Candle[],
  i: number,
  lookbackBars: number,
  fibMin = 0.62,
  fibMax = 0.79,
  minSwingPct = 0.5,
): { hit: boolean; stopOverride?: number; targetOverride?: number } {
  if (i < 5) return { hit: false };
  const start = Math.max(0, i - lookbackBars);
  let hiIdx = start, swingHigh = -Infinity;
  for (let j = start; j <= i; j++) {
    if (candles[j].high > swingHigh) { swingHigh = candles[j].high; hiIdx = j; }
  }
  if (hiIdx === i || hiIdx <= start + 2) return { hit: false }; // need a leg with room before the high
  let swingLow = Infinity;
  for (let j = start; j < hiIdx; j++) {
    if (candles[j].low < swingLow) swingLow = candles[j].low;
  }
  if (!isFinite(swingLow) || swingHigh <= swingLow) return { hit: false };
  const legPct = ((swingHigh - swingLow) / swingLow) * 100;
  if (legPct < minSwingPct) return { hit: false };
  const range = swingHigh - swingLow;
  const zoneLo = swingHigh - range * fibMax;
  const zoneHi = swingHigh - range * fibMin;
  const c = candles[i].close;
  const prev = candles[i - 1].close;
  // Trigger when current close is inside the OTE zone and prior close was above it
  if (c >= zoneLo && c <= zoneHi && prev > zoneHi) {
    return {
      hit: true,
      stopOverride: swingLow * 0.999,
      targetOverride: swingHigh,
    };
  }
  return { hit: false };
}

export function evalOteShort(
  candles: Candle[],
  i: number,
  lookbackBars: number,
  fibMin = 0.62,
  fibMax = 0.79,
  minSwingPct = 0.5,
): { hit: boolean; stopOverride?: number; targetOverride?: number } {
  if (i < 5) return { hit: false };
  const start = Math.max(0, i - lookbackBars);
  let loIdx = start, swingLow = Infinity;
  for (let j = start; j <= i; j++) {
    if (candles[j].low < swingLow) { swingLow = candles[j].low; loIdx = j; }
  }
  if (loIdx === i || loIdx <= start + 2) return { hit: false };
  let swingHigh = -Infinity;
  for (let j = start; j < loIdx; j++) {
    if (candles[j].high > swingHigh) swingHigh = candles[j].high;
  }
  if (!isFinite(swingHigh) || swingHigh <= swingLow) return { hit: false };
  const legPct = ((swingHigh - swingLow) / swingHigh) * 100;
  if (legPct < minSwingPct) return { hit: false };
  const range = swingHigh - swingLow;
  const zoneLo = swingLow + range * fibMin;
  const zoneHi = swingLow + range * fibMax;
  const c = candles[i].close;
  const prev = candles[i - 1].close;
  if (c >= zoneLo && c <= zoneHi && prev < zoneLo) {
    return {
      hit: true,
      stopOverride: swingHigh * 1.001,
      targetOverride: swingLow,
    };
  }
  return { hit: false };
}

// Stdv-of-key-opening: anchor at NYSE 9:30 ET (13:30 UTC during DST,
// 14:30 UTC standard). Group bars by trading day. For each prior day compute
// the max favorable excursion from that day's 9:30 open as a pct. Stdv across
// the last `lookbackDays` of those values gives the typical day's range. The
// breakout level today = today_open * (1 + k * stdv).
export function computeStdvOpenLevels(
  candles: Candle[],
  i: number,
  lookbackDays = 20,
  kSigma = 1.0,
): { todayOpen: number; upperThreshold: number; lowerThreshold: number } | null {
  if (i < 50 || candles.length === 0) return null;
  // Group bars by UTC date (yyyy-mm-dd). For each group, find the first bar
  // where UTC hour is 13 or 14 — that's the 9:30 ET open candle (handles DST).
  const days = new Map<string, { openIdx: number; open: number; high: number; low: number }>();
  for (let j = 0; j <= i; j++) {
    const t = candles[j].time * 1000;
    const d = new Date(t);
    const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    const hr = d.getUTCHours();
    const min = d.getUTCMinutes();
    // 9:30 ET = 13:30 UTC (DST) or 14:30 UTC (standard). Accept first bar at >=13:30 and <15:00.
    const isSessionOpen = (hr === 13 && min >= 30) || hr === 14;
    if (!isSessionOpen) continue;
    let entry = days.get(dayKey);
    if (!entry) {
      entry = { openIdx: j, open: candles[j].open, high: candles[j].high, low: candles[j].low };
      days.set(dayKey, entry);
    } else {
      if (candles[j].high > entry.high) entry.high = candles[j].high;
      if (candles[j].low < entry.low) entry.low = candles[j].low;
    }
  }
  const sortedDays = Array.from(days.entries()).sort((a, b) => a[1].openIdx - b[1].openIdx);
  if (sortedDays.length < 3) return null; // need at least a few days to estimate stdv

  const today = sortedDays[sortedDays.length - 1][1];
  const prior = sortedDays.slice(Math.max(0, sortedDays.length - 1 - lookbackDays), sortedDays.length - 1);
  if (prior.length < 2) return null;

  // Per-day excursion as percent of that day's open (use both up and down — symmetric stdv)
  const excursions: number[] = [];
  for (const [, day] of prior) {
    const upPct = ((day.high - day.open) / day.open) * 100;
    const downPct = ((day.open - day.low) / day.open) * 100;
    excursions.push(upPct, downPct);
  }
  const mean = excursions.reduce((a, x) => a + x, 0) / excursions.length;
  const variance = excursions.reduce((a, x) => a + (x - mean) ** 2, 0) / excursions.length;
  const stdv = Math.sqrt(variance);
  if (!isFinite(stdv) || stdv <= 0) return null;
  const todayOpen = today.open;
  const upperThreshold = todayOpen * (1 + (kSigma * stdv) / 100);
  const lowerThreshold = todayOpen * (1 - (kSigma * stdv) / 100);
  return { todayOpen, upperThreshold, lowerThreshold };
}

// Session VWAP: cumulative Σ(typical_price * volume) / Σ(volume) anchored at
// today's 9:30 ET open candle (13:30 UTC during DST, 14:30 UTC standard).
// Returns the running VWAP value at every bar in the session up through `i`.
export function buildSessionVwapSeries(
  candles: Candle[],
  i: number,
): { sessionStartIdx: number; vwapSeries: number[] } | null {
  if (candles.length === 0 || i <= 0) return null;
  const dayKey = (t: number) => {
    const d = new Date(t * 1000);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  };
  const todayKey = dayKey(candles[i].time);
  let sessionStartIdx = -1;
  for (let j = 0; j <= i; j++) {
    if (dayKey(candles[j].time) !== todayKey) continue;
    const dj = new Date(candles[j].time * 1000);
    const minutesUtc = dj.getUTCHours() * 60 + dj.getUTCMinutes();
    // First bar at or after 13:30 UTC (covers 9:30 ET in both DST & standard time)
    if (minutesUtc >= 13 * 60 + 30 && minutesUtc < 21 * 60) {
      sessionStartIdx = j;
      break;
    }
  }
  if (sessionStartIdx === -1) return null;
  const vwapSeries: number[] = [];
  let pvSum = 0, volSum = 0;
  for (let j = sessionStartIdx; j <= i; j++) {
    const c = candles[j];
    const tp = (c.high + c.low + c.close) / 3;
    const v = c.volume ?? 0;
    pvSum += tp * v;
    volSum += v;
    vwapSeries.push(volSum > 0 ? pvSum / volSum : NaN);
  }
  return { sessionStartIdx, vwapSeries };
}

// VWAP bounce (long): price has been above VWAP (in an "above-VWAP regime") for
// at least min_bars_in_regime, retraced down to within touch_distance_pct of
// VWAP within the last touch_within_bars, and the current bar closes back up
// (continuation off VWAP-as-support).
export function evalVwapBounceLong(
  candles: Candle[],
  i: number,
  minBarsInRegime = 6,
  touchWithinBars = 3,
  touchDistancePct = 0.05,
): { hit: boolean; stopOverride?: number; targetOverride?: number } {
  const session = buildSessionVwapSeries(candles, i);
  if (!session) return { hit: false };
  const { sessionStartIdx, vwapSeries } = session;
  if (vwapSeries.length < minBarsInRegime + 2) return { hit: false };
  const currentVwap = vwapSeries[vwapSeries.length - 1];
  if (!isFinite(currentVwap)) return { hit: false };
  // Current bar must close above VWAP and above prior close (bounce confirmation)
  if (candles[i].close <= currentVwap) return { hit: false };
  if (candles[i].close <= candles[i - 1].close) return { hit: false };
  // Regime check: the regime window before the touch should have been mostly above VWAP.
  // We look at the bars from `regimeStartK` up to (but not including) the touch window.
  const touchEndK = vwapSeries.length - 1;
  const touchStartK = Math.max(0, touchEndK - (touchWithinBars - 1));
  const regimeEndK = touchStartK - 1;
  const regimeStartK = regimeEndK - (minBarsInRegime - 1);
  if (regimeStartK < 0) return { hit: false };
  for (let k = regimeStartK; k <= regimeEndK; k++) {
    const idx = sessionStartIdx + k;
    const v = vwapSeries[k];
    if (!isFinite(v)) return { hit: false };
    if (candles[idx].close <= v) return { hit: false }; // regime broken
  }
  // Touch check: at least one bar in the touch window had its low within touchDistancePct of VWAP
  let touched = false;
  let touchLowestIdx = -1;
  let touchLowestPrice = Infinity;
  for (let k = touchStartK; k <= touchEndK - 1; k++) {
    const idx = sessionStartIdx + k;
    const v = vwapSeries[k];
    if (!isFinite(v)) continue;
    const lowDist = ((candles[idx].low - v) / v) * 100; // negative if below VWAP, small positive if just above
    // Touch if low came within touchDistancePct of VWAP from above (or briefly poked below)
    if (lowDist <= touchDistancePct && candles[idx].low < (vwapSeries[touchEndK] * (1 + touchDistancePct / 100))) {
      touched = true;
      if (candles[idx].low < touchLowestPrice) {
        touchLowestPrice = candles[idx].low;
        touchLowestIdx = idx;
      }
    }
  }
  if (!touched || touchLowestIdx < 0) return { hit: false };
  // Stop just below the touch low (structural)
  const stopOverride = touchLowestPrice * 0.999;
  return { hit: true, stopOverride };
}

export function evalVwapBounceShort(
  candles: Candle[],
  i: number,
  minBarsInRegime = 6,
  touchWithinBars = 3,
  touchDistancePct = 0.05,
): { hit: boolean; stopOverride?: number; targetOverride?: number } {
  const session = buildSessionVwapSeries(candles, i);
  if (!session) return { hit: false };
  const { sessionStartIdx, vwapSeries } = session;
  if (vwapSeries.length < minBarsInRegime + 2) return { hit: false };
  const currentVwap = vwapSeries[vwapSeries.length - 1];
  if (!isFinite(currentVwap)) return { hit: false };
  if (candles[i].close >= currentVwap) return { hit: false };
  if (candles[i].close >= candles[i - 1].close) return { hit: false };
  const touchEndK = vwapSeries.length - 1;
  const touchStartK = Math.max(0, touchEndK - (touchWithinBars - 1));
  const regimeEndK = touchStartK - 1;
  const regimeStartK = regimeEndK - (minBarsInRegime - 1);
  if (regimeStartK < 0) return { hit: false };
  for (let k = regimeStartK; k <= regimeEndK; k++) {
    const idx = sessionStartIdx + k;
    const v = vwapSeries[k];
    if (!isFinite(v)) return { hit: false };
    if (candles[idx].close >= v) return { hit: false };
  }
  let touched = false;
  let touchHighestIdx = -1;
  let touchHighestPrice = -Infinity;
  for (let k = touchStartK; k <= touchEndK - 1; k++) {
    const idx = sessionStartIdx + k;
    const v = vwapSeries[k];
    if (!isFinite(v)) continue;
    const highDist = ((v - candles[idx].high) / v) * 100;
    if (highDist <= touchDistancePct && candles[idx].high > (vwapSeries[touchEndK] * (1 - touchDistancePct / 100))) {
      touched = true;
      if (candles[idx].high > touchHighestPrice) {
        touchHighestPrice = candles[idx].high;
        touchHighestIdx = idx;
      }
    }
  }
  if (!touched || touchHighestIdx < 0) return { hit: false };
  const stopOverride = touchHighestPrice * 1.001;
  return { hit: true, stopOverride };
}

export function evaluateEntryAt(
  rule: EntryRule,
  candles: Candle[],
  i: number,
  rsiSeries: (number | null)[],
  smaFast?: (number | null)[],
  smaSlow?: (number | null)[],
): EntryEval {
  if (i < 1 || i >= candles.length) return { hit: false };
  const c = candles[i];
  switch (rule.type) {
    case "price_drop": {
      const lookbackBars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - lookbackBars];
      if (!past) return { hit: false };
      const pct = ((c.close - past.close) / past.close) * 100;
      return pct <= rule.magnitude_pct ? { hit: true } : { hit: false };
    }
    case "price_pop": {
      const lookbackBars = Math.max(1, Math.floor(rule.lookback_minutes / 5));
      const past = candles[i - lookbackBars];
      if (!past) return { hit: false };
      const pct = ((c.close - past.close) / past.close) * 100;
      return pct >= rule.magnitude_pct ? { hit: true } : { hit: false };
    }
    case "breakout_above": {
      if (i < rule.lookback_bars) return { hit: false };
      let high = -Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++) if (candles[j].high > high) high = candles[j].high;
      return c.close > high && candles[i - 1].close <= high ? { hit: true } : { hit: false };
    }
    case "breakdown_below": {
      if (i < rule.lookback_bars) return { hit: false };
      let low = Infinity;
      for (let j = i - rule.lookback_bars; j < i; j++) if (candles[j].low < low) low = candles[j].low;
      return c.close < low && candles[i - 1].close >= low ? { hit: true } : { hit: false };
    }
    case "rsi_below": {
      const r = rsiSeries[i], prev = rsiSeries[i - 1];
      if (r == null || prev == null) return { hit: false };
      return r < rule.threshold && prev >= rule.threshold ? { hit: true } : { hit: false };
    }
    case "rsi_above": {
      const r = rsiSeries[i], prev = rsiSeries[i - 1];
      if (r == null || prev == null) return { hit: false };
      return r > rule.threshold && prev <= rule.threshold ? { hit: true } : { hit: false };
    }
    case "ma_cross_up": {
      if (!smaFast || !smaSlow) return { hit: false };
      const fNow = smaFast[i], sNow = smaSlow[i], fPrev = smaFast[i - 1], sPrev = smaSlow[i - 1];
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) return { hit: false };
      return fNow > sNow && fPrev <= sPrev ? { hit: true } : { hit: false };
    }
    case "ma_cross_down": {
      if (!smaFast || !smaSlow) return { hit: false };
      const fNow = smaFast[i], sNow = smaSlow[i], fPrev = smaFast[i - 1], sPrev = smaSlow[i - 1];
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) return { hit: false };
      return fNow < sNow && fPrev >= sPrev ? { hit: true } : { hit: false };
    }
    case "ote_long":
      return evalOteLong(
        candles, i,
        rule.swing_lookback_bars,
        rule.fib_min ?? 0.62,
        rule.fib_max ?? 0.79,
        rule.min_swing_pct ?? 0.5,
      );
    case "ote_short":
      return evalOteShort(
        candles, i,
        rule.swing_lookback_bars,
        rule.fib_min ?? 0.62,
        rule.fib_max ?? 0.79,
        rule.min_swing_pct ?? 0.5,
      );
    case "stdv_open_above": {
      const levels = computeStdvOpenLevels(candles, i, rule.lookback_days ?? 20, rule.k_sigma ?? 1.0);
      if (!levels) return { hit: false };
      const prev = candles[i - 1].close;
      if (c.close > levels.upperThreshold && prev <= levels.upperThreshold) return { hit: true };
      return { hit: false };
    }
    case "stdv_open_below": {
      const levels = computeStdvOpenLevels(candles, i, rule.lookback_days ?? 20, rule.k_sigma ?? 1.0);
      if (!levels) return { hit: false };
      const prev = candles[i - 1].close;
      if (c.close < levels.lowerThreshold && prev >= levels.lowerThreshold) return { hit: true };
      return { hit: false };
    }
    case "vwap_bounce_long":
      return evalVwapBounceLong(
        candles, i,
        rule.min_bars_in_regime ?? 6,
        rule.touch_within_bars ?? 3,
        rule.touch_distance_pct ?? 0.05,
      );
    case "vwap_bounce_short":
      return evalVwapBounceShort(
        candles, i,
        rule.min_bars_in_regime ?? 6,
        rule.touch_within_bars ?? 3,
        rule.touch_distance_pct ?? 0.05,
      );
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
      const evalResult = evaluateEntryAt(rules.entry, candles, i, rsiSeries, smaFast, smaSlow);
      if (!evalResult.hit) { i++; continue; }
      const entryPrice = candles[i].close;
      const stopPrice =
        evalResult.stopOverride != null
          ? evalResult.stopOverride
          : rules.side === "long"
            ? entryPrice * (1 + rules.exit.stop_loss_pct / 100)
            : entryPrice * (1 - rules.exit.stop_loss_pct / 100);
      const targetPrice =
        evalResult.targetOverride != null
          ? evalResult.targetOverride
          : rules.side === "long"
            ? entryPrice * (1 + rules.exit.take_profit_pct / 100)
            : entryPrice * (1 - rules.exit.take_profit_pct / 100);
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
