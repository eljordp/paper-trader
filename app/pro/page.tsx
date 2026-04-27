import ProClient from "./pro-client";
import { PLAN_ORDER, PLANS, type Plan } from "@/lib/plans";

export default function ProPage() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-16 space-y-12">
      <div className="text-center space-y-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">Pricing</div>
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight">
          Pass your eval. Save the buy-in.
        </h1>
        <p className="text-[var(--color-text-dim)] max-w-2xl mx-auto">
          Try Pro free for 7 days. Upgrade to VIP for funded-tier accounts &amp; instruments.
          Enterprise if you&apos;re running a trading room.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLAN_ORDER.map((id) => (
          <PlanCard key={id} planId={id} />
        ))}
      </div>

      <div className="text-center text-xs text-[var(--color-text-faint)] max-w-prose mx-auto">
        Cancel anytime. Cheaper than 1/5 of one failed FTMO $100K attempt.
      </div>
    </div>
  );
}

function PlanCard({ planId }: { planId: Plan }) {
  const plan = PLANS[planId];
  const tierColor =
    planId === "pro"
      ? "var(--color-phase1)"
      : planId === "vip"
      ? "var(--color-pro)"
      : planId === "enterprise"
      ? "var(--color-elite)"
      : "var(--color-rookie)";
  const tierColorRgb =
    planId === "pro"
      ? "59, 130, 246"
      : planId === "vip"
      ? "245, 158, 11"
      : planId === "enterprise"
      ? "236, 72, 153"
      : "139, 149, 167";

  return (
    <div
      className="relative bg-[var(--color-surface)] rounded-lg p-6 space-y-5 transition-all hover:-translate-y-1"
      style={{
        border: plan.highlight
          ? `1px solid rgba(${tierColorRgb}, 0.6)`
          : `1px solid rgba(${tierColorRgb}, 0.3)`,
        boxShadow: plan.highlight
          ? `0 0 40px -12px rgba(${tierColorRgb}, 0.5)`
          : `0 0 30px -16px rgba(${tierColorRgb}, 0.3)`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(${tierColorRgb}, 0.8), transparent)`,
        }}
      />

      {plan.highlight && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded text-black"
          style={{ background: tierColor }}
        >
          Most popular
        </div>
      )}

      <div className="space-y-1">
        <div
          className="text-[10px] uppercase tracking-wider font-medium"
          style={{ color: tierColor }}
        >
          {plan.name}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-4xl tnum">{plan.priceLabel}</span>
          <span className="text-sm text-[var(--color-text-dim)]">{plan.blurb}</span>
        </div>
      </div>

      <ul className="space-y-2.5 min-h-[280px]">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
            <span style={{ color: tierColor }} className="shrink-0 mt-0.5">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <ProClient plan={planId} tierColor={tierColor} tierColorRgb={tierColorRgb} />
    </div>
  );
}
