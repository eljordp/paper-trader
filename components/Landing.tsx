import Link from "next/link";
import { TIERS, TIER_ORDER } from "@/lib/tiers";
import { ArrowRight, Check, Shield, Target, BookOpen, BarChart3, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";

export default function Landing() {
  return (
    <div>
      {/* HERO */}
      <section className="max-w-[1100px] mx-auto px-6 pt-20 pb-24 md:pt-32 md:pb-40 relative">
        <div className="space-y-8 max-w-3xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-up)] animate-pulse" />
            Live for FTMO · Apex · Topstep · MyFundedFutures candidates
          </div>
          <h1 className="font-serif text-5xl md:text-7xl leading-[0.95] tracking-tight">
            Pass your funded eval.<br />
            Stop paying{" "}
            <span
              className="italic"
              style={{
                background: "linear-gradient(135deg, var(--color-pro), var(--color-elite))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              $99
            </span>{" "}
            to learn the rules.
          </h1>
          <p className="text-lg md:text-xl text-[var(--color-text-dim)] leading-relaxed max-w-2xl">
            A paper trading simulator built around the same rules real funded prop firms use.
            Start with $10K. Pass evals to climb the ladder — $50K, $100K, $250K, $500K.
            Real markets. Real discipline. No real money on the line.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="btn-pulse inline-flex items-center gap-2 h-12 px-6 rounded-md text-sm font-medium hover:opacity-90 text-black"
              style={{
                background: "linear-gradient(135deg, var(--color-up), #00b377)",
              }}
            >
              Start free — $10K Rookie <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pro"
              className="inline-flex items-center h-12 px-5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] border border-[var(--color-border)] rounded-md hover:border-[var(--color-border-strong)]"
            >
              See pricing
            </Link>
          </div>
          <div className="text-xs text-[var(--color-text-faint)] tracking-wide">
            Free forever. No credit card. Real Yahoo Finance market data.
          </div>
        </div>

        {/* Decorative side: floating tier badges */}
        <div className="hidden lg:flex absolute right-6 top-32 flex-col gap-3 z-0">
          {TIER_ORDER.slice(0, 5).map((tier, i) => {
            const cfg = TIERS[tier];
            return (
              <div
                key={tier}
                className="float-soft px-4 py-2 rounded-lg backdrop-blur"
                style={{
                  background: `rgba(${cfg.colorRgb}, 0.08)`,
                  border: `1px solid rgba(${cfg.colorRgb}, 0.4)`,
                  animationDelay: `${i * 0.3}s`,
                }}
              >
                <div className="text-[10px] uppercase tracking-wider" style={{ color: cfg.color }}>
                  {cfg.name}
                </div>
                <div className="font-mono tnum text-sm mt-0.5">
                  ${(cfg.startingCash / 1000).toFixed(0)}K
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Hairline />

      {/* THE PROBLEM */}
      <section className="max-w-[1100px] mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] mb-4">
              The funded-eval racket
            </div>
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight leading-tight">
              Most candidates fail the rules,<br />not the strategy.
            </h2>
          </div>
          <div className="space-y-4 text-[var(--color-text-dim)] leading-relaxed">
            <p>
              FTMO charges <span className="text-[var(--color-text)] font-mono">$99–$1,080</span> per eval attempt.
              The pass rate is around <span className="text-[var(--color-text)] font-mono">10%</span>.
              Most failures aren&apos;t bad trades — they&apos;re rule violations.
              Daily loss limit. Max drawdown. Min trading days. Consistency rule.
            </p>
            <p>
              You can&apos;t practice these rules anywhere. Broker demo accounts have no rules.
              TradingView paper trading has no eval logic. So traders pay <span className="text-[var(--color-text)] font-mono">$300+</span> in eval attempts learning rules they could&apos;ve learned for free.
            </p>
            <p>
              <span className="text-[var(--color-text)] italic">This fixes that.</span>
            </p>
          </div>
        </div>
      </section>

      <Hairline />

      {/* TIER LADDER */}
      <section className="max-w-[1100px] mx-auto px-6 py-24">
        <div className="text-center space-y-3 mb-16">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">The ladder</div>
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight">Five accounts. Four evals. One mindset.</h2>
          <p className="text-[var(--color-text-dim)] max-w-2xl mx-auto">
            Each tier teaches you one thing real funded firms care about. Pass to unlock the next.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          {TIER_ORDER.map((tier) => {
            const cfg = TIERS[tier];
            const isElite = tier === "elite";
            return (
              <div
                key={tier}
                className="relative bg-[var(--color-surface)] rounded-lg p-5 space-y-3 transition-all hover:-translate-y-1"
                style={{
                  border: `1px solid rgba(${cfg.colorRgb}, 0.4)`,
                  boxShadow: `0 0 30px -16px rgba(${cfg.colorRgb}, 0.6)`,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, rgba(${cfg.colorRgb}, 0.8), transparent)`,
                  }}
                />
                <div
                  className="font-mono text-[10px] uppercase tracking-wider"
                  style={{ color: cfg.color }}
                >
                  {cfg.name}
                </div>
                <div
                  className={cn("font-serif text-3xl tnum", isElite && "holo-text")}
                  style={!isElite ? { color: cfg.color } : undefined}
                >
                  ${(cfg.startingCash / 1000).toFixed(0)}K
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)] leading-relaxed">
                  {cfg.blurb}
                </div>
                <div className="hairline pt-2 space-y-0.5 text-[10px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-faint)]">Target</span>
                    <span>{cfg.rules.profitTargetPct ? `+${cfg.rules.profitTargetPct}%` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-faint)]">Max DD</span>
                    <span>{cfg.rules.maxDrawdownPct ? `-${cfg.rules.maxDrawdownPct}%` : "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Hairline />

      {/* WHAT YOU GET */}
      <section className="max-w-[1100px] mx-auto px-6 py-24">
        <div className="space-y-3 mb-16 max-w-2xl">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">What you get</div>
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight">Built for reps. Not for tutorials.</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
          <Feature
            icon={<Shield className="w-4 h-4" />}
            title="Real eval rules, real consequences"
            body="FTMO-style profit target, daily loss limit, max drawdown, min trading days. Break a rule, your account fails. Just like the real thing."
          />
          <Feature
            icon={<Target className="w-4 h-4" />}
            title="Stop loss & take profit that actually fire"
            body="Set bracket orders on entry. They auto-execute when price hits — even when you&apos;re not watching. R/R math live as you size."
          />
          <Feature
            icon={<BarChart3 className="w-4 h-4" />}
            title="Equity curve & day's P&L"
            body="Watch your account grow tick by tick. Daily loss tracker mirrors what the real funded firms show their candidates."
          />
          <Feature
            icon={<BookOpen className="w-4 h-4" />}
            title="Trade journal built in"
            body="Note why you took every trade. Review weekly. Spot the patterns in what makes money — the patterns in what loses it."
          />
          <Feature
            icon={<Trophy className="w-4 h-4" />}
            title="Unlock the ladder"
            body="Pass each tier to unlock the next. Start at $10K Rookie, climb to $500K Elite. Trapped value — you don't quit halfway up."
          />
          <Feature
            icon={<Check className="w-4 h-4" />}
            title="Real market data, free"
            body="Live prices on every US ticker, charts, news, market movers. No credit card. No demo. No expiration."
          />
        </div>
      </section>

      <Hairline />

      {/* PRICING TEASE */}
      <section className="max-w-[1100px] mx-auto px-6 py-24 text-center space-y-6">
        <h2 className="font-serif text-4xl md:text-5xl tracking-tight">Free forever for Rookie.</h2>
        <p className="text-[var(--color-text-dim)] max-w-xl mx-auto">
          Pro is <span className="text-[var(--color-text)] font-mono">$19/mo</span> — less than 1/5 of one failed FTMO $100K attempt.
          Unlocks the full tier ladder, options, futures, replay mode, and analytics.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Start free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/pro"
            className="inline-flex items-center gap-2 h-12 px-5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors border border-[var(--color-border)] rounded-md"
          >
            See full pricing
          </Link>
        </div>
      </section>

      <Hairline />

      {/* FAQ */}
      <section className="max-w-[800px] mx-auto px-6 py-24">
        <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-12 text-center">Questions</h2>
        <div className="space-y-8">
          <FAQItem
            q="Is this affiliated with FTMO, Apex, or Topstep?"
            a="No. We're independent. We just built a sim that mirrors their published rules so candidates can practice without burning eval fees."
          />
          <FAQItem
            q="Is the data real?"
            a="Yes. Live US stock quotes, charts, and news from Yahoo Finance. Prices update every 5–15 seconds while you're on a page."
          />
          <FAQItem
            q="Do I need a broker account?"
            a="No. This is paper money only. You can't lose anything except hypothetical capital."
          />
          <FAQItem
            q="What happens if I fail an eval?"
            a="Your account locks. You can reset it from the dashboard and try again. In real funded evals, you'd pay another $99–$1,080. Here you reset for free and try a different approach."
          />
          <FAQItem
            q="When do options and futures launch?"
            a="Soon. Pro members get early access. We're building futures first because that's what Topstep and Apex actually use."
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--color-border)] mt-12">
        <div className="max-w-[1100px] mx-auto px-6 py-12 flex flex-wrap gap-6 items-center justify-between text-xs text-[var(--color-text-faint)]">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-lg tracking-tight">paper</span>
            <span className="font-mono uppercase tracking-[0.18em]">trader</span>
          </div>
          <div className="flex flex-wrap gap-6">
            <Link href="/pro" className="hover:text-[var(--color-text)]">Pricing</Link>
            <Link href="/learn" className="hover:text-[var(--color-text)]">Learn</Link>
            <Link href="/terms" className="hover:text-[var(--color-text)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--color-text)]">Privacy</Link>
          </div>
          <div className="text-[10px] text-[var(--color-text-faint)] tracking-wide">
            Not financial advice. Paper money only.
          </div>
        </div>
      </footer>
    </div>
  );
}

function Hairline() {
  return <div className="h-px bg-[var(--color-border)] max-w-[1100px] mx-auto" />;
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[var(--color-text-dim)]">
        {icon}
        <h3 className="font-serif text-2xl text-[var(--color-text)]">{title}</h3>
      </div>
      <p className="text-[var(--color-text-dim)] leading-relaxed text-sm pl-6">{body}</p>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="space-y-2">
      <h3 className="font-serif text-xl">{q}</h3>
      <p className="text-[var(--color-text-dim)] leading-relaxed">{a}</p>
    </div>
  );
}
