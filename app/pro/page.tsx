import { Check } from "lucide-react";
import ProClient from "./pro-client";

const FEATURES = {
  free: [
    "$10K Rookie account",
    "US stocks, real market data",
    "Stop loss & take profit",
    "Trade journal",
    "Equity curve",
    "Live news feed",
  ],
  pro: [
    "Everything in Free",
    "$50K → $100K → $250K → $500K accounts",
    "FTMO-style eval rules",
    "Options trading (calls, puts, Greeks)",
    "Futures (micro contracts: MNQ, MES, MGC, MCL)",
    "Replay any past trading day",
    "Performance analytics (R-multiple, profit factor, Sharpe)",
    "Multi-account portfolios",
    "Leaderboards",
    "Priority support",
  ],
};

export default function ProPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-6 py-12 space-y-12">
      <div className="text-center space-y-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">Pricing</div>
        <h1 className="font-serif text-6xl tracking-tight">Pass your eval. Save the buy-in.</h1>
        <p className="text-[var(--color-text-dim)] max-w-prose mx-auto">
          One paid month here costs less than one failed eval attempt.
          Practice the exact rules. Pass on your first try.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {/* Free */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Free</div>
            <div className="font-serif text-4xl mt-1">$0</div>
            <div className="text-xs text-[var(--color-text-dim)] mt-1">forever</div>
          </div>
          <ul className="space-y-2.5">
            {FEATURES.free.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                <Check className="w-4 h-4 text-[var(--color-text-faint)] shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <div className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider pt-2">
            You're already on this plan
          </div>
        </div>

        {/* Pro */}
        <div className="bg-[var(--color-surface)] border-2 border-[var(--color-up)]/40 rounded-lg p-6 space-y-5 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--color-up)] text-black text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded">
            Recommended
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Pro</div>
            <div className="font-serif text-4xl mt-1">
              $19<span className="text-base text-[var(--color-text-dim)]">/mo</span>
            </div>
            <div className="text-xs text-[var(--color-text-dim)] mt-1">cancel anytime</div>
          </div>
          <ul className="space-y-2.5">
            {FEATURES.pro.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-[var(--color-up)] shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <ProClient />
        </div>
      </div>

      <div className="text-center text-xs text-[var(--color-text-faint)] max-w-prose mx-auto">
        Cheaper than 1/5 of a failed FTMO $100K attempt. If you can't pass here for free, don't risk real eval money.
      </div>
    </div>
  );
}
