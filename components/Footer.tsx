import Link from "next/link";

export default function Footer() {
  return (
    <footer className="hidden md:block border-t border-[var(--color-border)] mt-16">
      <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-text-faint)]">
        <div className="flex items-center gap-4">
          <span className="font-mono uppercase tracking-[0.18em]">paper trader</span>
          <span>·</span>
          <span>Practice on real markets with real eval rules</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/leaderboard" className="hover:text-[var(--color-text-dim)]">
            Leaderboard
          </Link>
          <Link href="/learn" className="hover:text-[var(--color-text-dim)]">
            Learn
          </Link>
          <Link href="/u/ai-trader" className="hover:text-[var(--color-text-dim)]">
            AI Trader
          </Link>
          <Link href="/privacy" className="hover:text-[var(--color-text-dim)]">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--color-text-dim)]">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
