"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortfolio } from "./PortfolioProvider";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { TIERS } from "@/lib/tiers";
import { cn } from "@/lib/cn";
import TickerSearch from "./TickerSearch";
import { Sparkles, Clock } from "lucide-react";
import { effectivePlan, isTrialActive, trialDaysRemaining } from "@/lib/plans";
import { getFuturesSpec } from "@/lib/instruments";
import NavGroup from "./NavGroup";
import AvatarMenu from "./AvatarMenu";

const primaryLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
];

const marketsGroup = [
  { href: "/watchlist", label: "Watchlist", description: "Tickers you're tracking" },
  { href: "/news", label: "News", description: "Headlines + ticker mentions" },
];

const brainGroup = [
  { href: "/strategies", label: "Strategies", description: "Your playbook + tagged trades" },
  { href: "/ai-lab", label: "AI Lab", description: "Generate, backtest, and run hypotheses" },
  { href: "/history", label: "History", description: "Closed trades + reviews" },
];

export default function Nav() {
  const pathname = usePathname();
  const snapshot = usePortfolio();
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!snapshot?.positions || snapshot.positions.length === 0) {
      setPrices({});
      return;
    }
    const symbols = snapshot.positions.map((p) => p.ticker).join(",");
    let cancelled = false;
    const fetchPrices = async () => {
      try {
        const r = await fetch(`/api/quotes?symbols=${symbols}`);
        const data = await r.json();
        if (cancelled) return;
        const px: Record<string, number> = {};
        for (const sym of Object.keys(data)) px[sym] = data[sym].price;
        setPrices(px);
      } catch {}
    };
    fetchPrices();
    const id = setInterval(fetchPrices, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [snapshot]);

  const isAuth = !!snapshot;
  const account = snapshot?.activeAccount;

  let equity = 0;
  let change = 0;
  let changePct = 0;

  if (snapshot && account) {
    const positionsValue = snapshot.positions.reduce((acc, p) => {
      const px = prices[p.ticker] ?? Number(p.avg_cost);
      if (p.instrument_type === "futures") {
        const spec = getFuturesSpec(p.ticker);
        const pv = spec?.pointValue ?? 1;
        const move = p.side === "long" ? px - Number(p.avg_cost) : Number(p.avg_cost) - px;
        return acc + Number(p.margin_held ?? 0) + move * pv * Number(p.shares);
      }
      const v = Number(p.shares) * px;
      return p.side === "short" ? acc - v : acc + v;
    }, 0);
    equity = Number(account.cash) + positionsValue;
    change = equity - Number(account.starting_cash);
    changePct = Number(account.starting_cash) > 0 ? (change / Number(account.starting_cash)) * 100 : 0;
  }

  const userPlan = snapshot ? effectivePlan(snapshot.profile) : "free";
  const trialActive = snapshot ? isTrialActive(snapshot.profile.trial_until) : false;
  const trialDays = snapshot ? trialDaysRemaining(snapshot.profile.trial_until) : 0;

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)] sticky top-0 z-30 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-baseline gap-2 shrink-0">
          <span className="font-serif text-2xl tracking-tight leading-none">paper</span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-text-faint)]">trader</span>
        </Link>

        {isAuth && (
          <nav className="hidden md:flex items-center gap-1">
            {primaryLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  pathname === l.href
                    ? "text-[var(--color-text)] bg-[var(--color-surface)]"
                    : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                )}
              >
                {l.label}
              </Link>
            ))}
            <NavGroup label="Markets" children={marketsGroup} />
            <NavGroup label="Brain" children={brainGroup} />
          </nav>
        )}

        {isAuth && (
          <div className="flex-1 max-w-md">
            <TickerSearch />
          </div>
        )}

        {!isAuth && <div className="flex-1" />}

        {isAuth && account && (
          <Link
            href="/accounts"
            className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] transition-colors"
            title="Switch account"
          >
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              {TIERS[account.tier].name} · ${(Number(account.starting_cash) / 1000).toFixed(0)}K
            </span>
            <span className="font-mono tnum text-sm">{money(equity, { cents: false })}</span>
            <span
              className={cn(
                "font-mono tnum text-xs",
                change > 0 ? "text-[var(--color-up)]" : change < 0 ? "text-[var(--color-down)]" : "text-[var(--color-text-dim)]",
              )}
            >
              {change >= 0 ? "+" : ""}{changePct.toFixed(2)}%
            </span>
          </Link>
        )}

        {/* Free → upgrade nudge stays inline (high-intent), trial badge stays inline (urgency).
            Everything else (plan + role) lives inside the avatar menu. */}
        {isAuth && trialActive && userPlan === "pro" && snapshot?.profile.plan === "free" && (
          <Link
            href="/pro"
            className="hidden md:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md transition-opacity hover:opacity-80"
            style={{
              background: "rgba(59, 130, 246, 0.12)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              color: "var(--color-phase1)",
            }}
          >
            <Clock className="w-3 h-3" />
            Pro trial · {trialDays}d left
          </Link>
        )}
        {isAuth && userPlan === "free" && !trialActive && (
          <Link
            href="/pro"
            className="hidden md:inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--color-up)] hover:opacity-80 px-2"
          >
            <Sparkles className="w-3 h-3" /> Upgrade
          </Link>
        )}

        {isAuth && snapshot ? (
          <AvatarMenu profile={snapshot.profile} />
        ) : (
          <Link
            href="/login"
            className="px-4 h-9 flex items-center rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
