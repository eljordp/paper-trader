"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Briefcase, Star, Trophy, Layers } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePortfolio } from "./PortfolioProvider";

const tabs = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { href: "/watchlist", label: "Watch", Icon: Star },
  { href: "/leaderboard", label: "Ranks", Icon: Trophy },
  { href: "/accounts", label: "Tiers", Icon: Layers },
];

export default function MobileNav() {
  const pathname = usePathname();
  const snapshot = usePortfolio();
  if (!snapshot) return null; // Only show for authenticated users

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-bg)]/95 backdrop-blur-md border-t border-[var(--color-border)]">
      <div
        className="flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] uppercase tracking-wider transition-colors",
                active
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 transition-transform",
                  active && "scale-110"
                )}
                strokeWidth={active ? 2.4 : 1.8}
              />
              <span className="font-medium">{label}</span>
              {active && (
                <span className="absolute top-0 w-8 h-0.5 bg-[var(--color-up)] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
