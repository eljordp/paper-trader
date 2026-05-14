import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuote, getOptionMidPrice } from "@/lib/yahoo";
import {
  getFuturesSpec,
  parseOptionSymbol,
  OPTION_CONTRACT_MULTIPLIER,
} from "@/lib/instruments";

// Compute marked-to-market equity for an account: cash plus the current
// value of every open position. Used to show realistic return % on the
// public pages — without this the dashboard reports -100% return when the
// account has $250K tied up in an open position and $0 in cash.
//
// Equity accounting by instrument:
//   stocks long:    equity contribution = shares * current_price
//   stocks short:   equity contribution = shares * (2*entry - current_price)
//                   (cash already credited proceeds on entry; here we book
//                    the unrealized so the closed-out math equals starting + pnl)
//   futures:        equity contribution = margin_held + (current - entry) *
//                   pointValue * contracts * sideSign
//   options (long): equity contribution = contracts * current_premium * 100

export type EquityBreakdown = {
  startingCash: number;
  cash: number;
  positionsValue: number; // sum of mark-to-market contributions from open positions
  equity: number;         // cash + positionsValue
  returnPct: number;      // (equity - startingCash) / startingCash * 100
  unrealizedPnl: number;  // for reporting — positionsValue - cost-basis-equivalent
};

type PositionRow = {
  id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  side: "long" | "short";
  instrument_type: "stock" | "futures" | "option" | string;
  margin_held: number | null;
};

type AccountRow = {
  id: string;
  cash: number;
  starting_cash: number;
};

export async function computeAccountEquity(
  sb: SupabaseClient,
  accountId: string,
): Promise<EquityBreakdown | null> {
  const { data: accountRow } = await sb
    .from("accounts")
    .select("id, cash, starting_cash")
    .eq("id", accountId)
    .maybeSingle();
  if (!accountRow) return null;
  const account = accountRow as AccountRow;

  const { data: positions } = await sb
    .from("positions")
    .select("id, ticker, shares, avg_cost, side, instrument_type, margin_held")
    .eq("account_id", accountId);
  const list = (positions ?? []) as PositionRow[];

  let positionsValue = 0;
  let unrealized = 0;

  // Batch-fetch unique stock/futures tickers in one pass each
  const stockFutTickers = new Set<string>();
  for (const p of list) {
    if (p.instrument_type === "stock" || p.instrument_type === "futures") {
      stockFutTickers.add(p.ticker);
    }
  }
  const priceByTicker = new Map<string, number>();
  await Promise.all(
    Array.from(stockFutTickers).map(async (t) => {
      try {
        const q = await getQuote(t);
        if (q?.price) priceByTicker.set(t, q.price);
      } catch {
        // ignore — position will be marked at entry cost as fallback
      }
    }),
  );

  // Resolve option premiums (each is one chain fetch — different from stocks)
  const optionPremiumByTicker = new Map<string, number>();
  await Promise.all(
    list
      .filter((p) => p.instrument_type === "option")
      .map(async (p) => {
        const parsed = parseOptionSymbol(p.ticker);
        if (!parsed) return;
        const mid = await getOptionMidPrice(
          parsed.underlying,
          parsed.expiration,
          parsed.strike,
          parsed.optionType,
        );
        if (mid != null && mid > 0) optionPremiumByTicker.set(p.ticker, mid);
      }),
  );

  for (const p of list) {
    const qty = Number(p.shares);
    const entry = Number(p.avg_cost);
    if (p.instrument_type === "futures") {
      const current = priceByTicker.get(p.ticker) ?? entry;
      const spec = getFuturesSpec(p.ticker);
      const pv = spec?.pointValue ?? 1;
      const sideSign = p.side === "long" ? 1 : -1;
      const upnl = (current - entry) * pv * qty * sideSign;
      const contribution = Number(p.margin_held ?? 0) + upnl;
      positionsValue += contribution;
      unrealized += upnl;
    } else if (p.instrument_type === "option") {
      // Long options only — engine doesn't support short premium
      const currentPremium = optionPremiumByTicker.get(p.ticker) ?? entry;
      const value = qty * currentPremium * OPTION_CONTRACT_MULTIPLIER;
      positionsValue += value;
      unrealized += (currentPremium - entry) * qty * OPTION_CONTRACT_MULTIPLIER;
    } else {
      // Stocks
      const current = priceByTicker.get(p.ticker) ?? entry;
      if (p.side === "long") {
        positionsValue += qty * current;
        unrealized += (current - entry) * qty;
      } else {
        // Short: equity contribution mirrors the long math but flipped.
        // cash already includes the entry proceeds (+qty*entry) so to keep
        // equity = starting + pnl when price unchanged we book the short
        // position's contribution as qty*(2*entry - current).
        positionsValue += qty * (2 * entry - current);
        unrealized += (entry - current) * qty;
      }
    }
  }

  const cash = Number(account.cash);
  const equity = cash + positionsValue;
  const startingCash = Number(account.starting_cash);
  const returnPct = startingCash > 0 ? ((equity - startingCash) / startingCash) * 100 : 0;
  return { startingCash, cash, positionsValue, equity, returnPct, unrealizedPnl: unrealized };
}

// Batched version for the leaderboard — computes equity for multiple
// accounts in one shot, deduplicating the price/chain fetches across AIs.
export async function computeEquityForAccounts(
  sb: SupabaseClient,
  accountIds: string[],
): Promise<Record<string, EquityBreakdown>> {
  const result: Record<string, EquityBreakdown> = {};
  // Naive sequential to keep the cumulative request volume sane — each AI
  // has 0-5 positions so even sequential it's a few hundred ms.
  for (const id of accountIds) {
    const eb = await computeAccountEquity(sb, id);
    if (eb) result[id] = eb;
  }
  return result;
}
