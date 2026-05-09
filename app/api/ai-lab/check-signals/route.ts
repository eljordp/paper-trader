import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCandles } from "@/lib/yahoo";
import type { StrategyRules } from "@/lib/aiLab";
import { buy, shortOpen } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb.from("profiles").select("active_account_id").eq("id", user.id).single();
  const activeId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (!activeId) return NextResponse.json({ fired: [] });

  const { data: account } = await sb.from("accounts").select("*").eq("id", activeId).single();
  if (!account || account.status !== "active") return NextResponse.json({ fired: [] });

  const { data: liveStrategies } = await sb.from("ai_strategies").select("*").eq("user_id", user.id).eq("status", "live");
  if (!liveStrategies || liveStrategies.length === 0) return NextResponse.json({ fired: [] });

  const fired: Array<{ strategyId: string; ticker: string; side: string; price: number }> = [];
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);

  for (const s of liveStrategies as Array<{
    id: string; name: string; instruments: string[]; rules: StrategyRules;
    max_account_risk_pct: number; max_concurrent_positions: number; max_trades_per_day: number;
  }>) {
    const { data: todayTrades } = await sb.from("trades").select("id").eq("ai_strategy_id", s.id).gte("created_at", todayStart.toISOString());
    if ((todayTrades?.length ?? 0) >= (s.max_trades_per_day ?? 5)) continue;

    const { count: openCount } = await sb.from("positions").select("id", { count: "exact", head: true }).eq("account_id", activeId).in("ticker", s.instruments);
    if ((openCount ?? 0) >= (s.max_concurrent_positions ?? 3)) continue;

    for (const ticker of s.instruments) {
      let candles;
      try { candles = await getCandles(ticker, "5D"); } catch { continue; }
      if (!candles || candles.length < 50) continue;

      const i = candles.length - 1;
      const r = s.rules;
      const c = candles[i];
      if (r.time_window_utc) {
        const hr = new Date(c.time * 1000).getUTCHours();
        if (hr < r.time_window_utc[0] || hr >= r.time_window_utc[1]) continue;
      }

      let entryHit = false;
      switch (r.entry.type) {
        case "price_drop": {
          const lookbackBars = Math.max(1, Math.floor(r.entry.lookback_minutes / 5));
          const past = candles[i - lookbackBars];
          if (past) entryHit = ((c.close - past.close) / past.close) * 100 <= r.entry.magnitude_pct;
          break;
        }
        case "price_pop": {
          const lookbackBars = Math.max(1, Math.floor(r.entry.lookback_minutes / 5));
          const past = candles[i - lookbackBars];
          if (past) entryHit = ((c.close - past.close) / past.close) * 100 >= r.entry.magnitude_pct;
          break;
        }
        case "breakout_above": {
          if (i >= r.entry.lookback_bars) {
            let high = -Infinity;
            for (let j = i - r.entry.lookback_bars; j < i; j++) if (candles[j].high > high) high = candles[j].high;
            entryHit = c.close > high && candles[i - 1].close <= high;
          }
          break;
        }
        case "breakdown_below": {
          if (i >= r.entry.lookback_bars) {
            let low = Infinity;
            for (let j = i - r.entry.lookback_bars; j < i; j++) if (candles[j].low < low) low = candles[j].low;
            entryHit = c.close < low && candles[i - 1].close >= low;
          }
          break;
        }
        default: break;
      }
      if (!entryHit) continue;

      const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentCount } = await sb.from("trades").select("id", { count: "exact", head: true }).eq("ai_strategy_id", s.id).eq("ticker", ticker).gte("created_at", sixtyMinAgo);
      if ((recentCount ?? 0) > 0) continue;

      const entryPrice = c.close;
      const stopPrice = r.side === "long" ? entryPrice * (1 + r.exit.stop_loss_pct / 100) : entryPrice * (1 - r.exit.stop_loss_pct / 100);
      const targetPrice = r.side === "long" ? entryPrice * (1 + r.exit.take_profit_pct / 100) : entryPrice * (1 - r.exit.take_profit_pct / 100);
      const stopDistance = Math.abs(entryPrice - stopPrice);
      if (stopDistance <= 0) continue;
      const riskBudget = (Number(account.starting_cash) * (s.max_account_risk_pct ?? 1)) / 100;
      const qty = Math.floor((riskBudget / stopDistance) * 100) / 100;
      if (qty <= 0) continue;

      const fd = new FormData();
      fd.set("accountId", activeId);
      fd.set("ticker", ticker);
      fd.set("qty", String(qty));
      fd.set("stopLoss", String(stopPrice));
      fd.set("takeProfit", String(targetPrice));
      fd.set("notes", `AI: ${s.name}`);

      let result: { error?: string; success?: string };
      if (r.side === "long") result = await buy(fd);
      else result = await shortOpen(fd);

      const rationale = result.success
        ? `Signal fired on ${ticker} at $${entryPrice.toFixed(2)}. Strategy: "${s.name}". Side: ${r.side}. Stop: $${stopPrice.toFixed(2)} (${r.exit.stop_loss_pct}%). Target: $${targetPrice.toFixed(2)} (+${r.exit.take_profit_pct}%). Sized ${qty} units for 1% risk ($${riskBudget.toFixed(0)}).`
        : `Signal triggered on ${ticker} but fill failed: ${result.error ?? "unknown"}.`;

      await sb.from("ai_decisions").insert({
        user_id: user.id, strategy_id: s.id,
        decision_type: result.success ? "trade_filled" : "signal_fired",
        inputs: { ticker, entry_price: entryPrice, stop_price: stopPrice, target_price: targetPrice, qty, condition: r.entry },
        output: { success: !!result.success, message: result.success ?? result.error },
        rationale,
      });

      if (result.success) {
        const { data: justFired } = await sb.from("trades").select("id").eq("account_id", activeId).eq("ticker", ticker).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (justFired) await sb.from("trades").update({ ai_strategy_id: s.id }).eq("id", (justFired as { id: string }).id);
        fired.push({ strategyId: s.id, ticker, side: r.side, price: entryPrice });
      }
      await sb.from("ai_strategies").update({ last_signal_at: new Date().toISOString() }).eq("id", s.id);
    }
  }

  return NextResponse.json({ fired });
}
