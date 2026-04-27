export type GlossaryEntry = {
  term: string;
  short: string;
  detail: string;
  example?: string;
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  pe: {
    term: "P/E Ratio",
    short: "Price ÷ Earnings per share. How much you pay for $1 of profit.",
    detail:
      "A high P/E means investors expect big growth. A low P/E can mean the stock is cheap — or that the company is in trouble. Compare to the sector average, not in isolation.",
    example: "If a stock is $100 and earns $5/share, P/E = 20. You're paying $20 for $1 of yearly profit.",
  },
  marketCap: {
    term: "Market Cap",
    short: "Total value of all the company's shares.",
    detail:
      "Price per share × shares outstanding. Tells you how big the company is. Mega cap = $200B+, large = $10B+, mid = $2B–$10B, small = $300M–$2B.",
  },
  volume: {
    term: "Volume",
    short: "How many shares traded today.",
    detail:
      "Higher volume = more liquidity = easier to enter/exit without moving the price. If volume spikes way above average, something's happening — news, earnings, or smart money moving.",
  },
  avgVolume: {
    term: "Avg Volume",
    short: "Typical daily trading volume.",
    detail: "The 3-month average. Compare to today's volume to spot unusual activity.",
  },
  eps: {
    term: "EPS",
    short: "Earnings per share.",
    detail: "Net income ÷ shares outstanding. The slice of profit attributable to one share. Higher = better.",
  },
  dividendYield: {
    term: "Dividend Yield",
    short: "Annual dividend ÷ price, as a %.",
    detail:
      "How much cash the company pays you per year just for holding. Tech often pays 0%. Mature businesses (banks, utilities, REITs) pay 2–6%.",
  },
  beta: {
    term: "Beta",
    short: "How much the stock moves vs the market.",
    detail:
      "1.0 = moves with the market. 2.0 = twice as volatile. 0.5 = half as volatile. Tech stocks usually 1.2–2.0. Utilities ~0.5.",
  },
  change: {
    term: "Change",
    short: "Today's price move in dollars.",
    detail: "Current price minus previous close. Pair with % change for context.",
  },
  changePct: {
    term: "% Change",
    short: "Today's price move as a percent.",
    detail: "More useful than $ change for comparing stocks at different prices.",
  },
  prevClose: {
    term: "Previous Close",
    short: "Where the stock closed yesterday.",
    detail: "The reference point for today's % change. After hours moves don't count toward this.",
  },
  open: {
    term: "Open",
    short: "Today's opening price.",
    detail: "Often gaps up/down from previous close due to overnight news or earnings.",
  },
  dayRange: {
    term: "Day's Range",
    short: "Today's low and high.",
    detail: "Tight range = consolidation. Wide range = volatility, often around news.",
  },
  yearRange: {
    term: "52-Week Range",
    short: "The lowest and highest price in the past year.",
    detail:
      "Where the stock sits in this range matters. Near 52-week high = momentum. Near 52-week low = either a value play or a falling knife.",
  },
  avgCost: {
    term: "Avg Cost",
    short: "Your blended purchase price for this position.",
    detail:
      "When you buy more, the average is recalculated. If you buy 10 @ $100 then 10 @ $120, avg cost = $110. Your P&L is measured against this.",
  },
  unrealizedPnl: {
    term: "Unrealized P&L",
    short: "Paper gains or losses on your open positions.",
    detail: "(Current price − avg cost) × shares. Not real until you sell.",
  },
  realizedPnl: {
    term: "Realized P&L",
    short: "Actual gains/losses from trades you've closed.",
    detail: "Locked in. The compound of all your sells.",
  },
  buyingPower: {
    term: "Buying Power",
    short: "Cash you have available to buy stock.",
    detail: "In paper trading, this just equals your cash. Real brokerages may add margin.",
  },
};

export function explain(key: string): GlossaryEntry | null {
  return GLOSSARY[key] ?? null;
}
