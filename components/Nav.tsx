"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortfolio } from "./PortfolioProvider";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { totalEquity } from "@/lib/store";
import { cn } from "@/lib/cn";
import TickerSearch from "./TickerSearch";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/history", label: "History" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/news", label: "News" },
  { href: "/learn", label: "Learn" },
];

export default function Nav() {
  const pathname = usePathname();
  const { portfolio, ready } = usePortfolio();
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!portfolio || portfolio.positions.length === 0) {
      setPrices({});
      return;
    }
    const symbols = portfolio.positions.map((p) => p.ticker).join(",");
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
  }, [portfolio]);

  const equity = portfolio ? totalEquity(portfolio, prices) : 0;
  const change = portfolio ? equity - portfolio.startingCash : 0;
  const changePct = portfolio && portfolio.startingCash > 0 ? (change / portfolio.startingCash) * 100 : 0;

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)] sticky top-0 z-30 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-8">
        <Link href="/" className="flex items-baseline gap-2 shrink-0">
          <span className="font-serif text-2xl tracking-tight leading-none">paper</span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-text-faint)]">trader</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                pathname === l.href
                  ? "text-[var(--color-text)] bg-[var(--color-surface)]"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1 max-w-md">
          <TickerSearch />
        </div>

        {ready && portfolio && (
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">Equity</div>
              <div className="tnum font-mono text-sm leading-tight">{money(equity)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">P&L</div>
              <div
                className={cn(
                  "tnum font-mono text-sm leading-tight",
                  change > 0 ? "text-[var(--color-up)]" : change < 0 ? "text-[var(--color-down)]" : "text-[var(--color-text-dim)]"
                )}
              >
                {change >= 0 ? "+" : ""}{money(change)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
