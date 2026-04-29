"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/PortfolioProvider";
import { type Plan, effectivePlan, PLAN_ORDER, PLANS, isTrialActive, trialDaysRemaining } from "@/lib/plans";

export default function ProClient({
  plan,
  tierColor,
  tierColorRgb,
}: {
  plan: Plan;
  tierColor: string;
  tierColorRgb: string;
}) {
  const snapshot = usePortfolio();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = snapshot?.profile;
  const userPlan = profile ? effectivePlan(profile) : "free";
  const userPlanRank = PLAN_ORDER.indexOf(userPlan);
  const cardPlanRank = PLAN_ORDER.indexOf(plan);

  const isCurrentPlan = userPlan === plan;
  const isLowerThanCurrent = cardPlanRank < userPlanRank;
  const trialActive = isTrialActive(profile?.trial_until);
  const trialDays = trialDaysRemaining(profile?.trial_until);

  const upgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Checkout failed");
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setLoading(false);
    }
  };

  const manage = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await r.json();
      if (data.url) window.location.href = data.url;
      else {
        setError(data.error ?? "Portal failed");
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setLoading(false);
    }
  };

  // Free plan card
  if (plan === "free") {
    if (!profile) {
      return (
        <a
          href="/login"
          className="btn-pulse w-full h-11 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-sm font-medium flex items-center justify-center transition-colors"
        >
          Get started free
        </a>
      );
    }
    return (
      <div className="text-xs uppercase tracking-wider text-center text-[var(--color-text-faint)] pt-2">
        {userPlan === "free" && !trialActive ? "Your current plan" : "Free tier"}
      </div>
    );
  }

  // Enterprise = "Talk to sales" (mailto for now)
  if (plan === "enterprise" && userPlan !== "enterprise") {
    return (
      <a
        href="mailto:hello@paper-trader.app?subject=Enterprise%20plan"
        className="btn-pulse w-full h-11 rounded-md text-sm font-medium hover:opacity-90 flex items-center justify-center text-black"
        style={{ background: tierColor }}
      >
        Talk to sales
      </a>
    );
  }

  if (isCurrentPlan) {
    return (
      <div className="space-y-2">
        <div
          className="text-xs uppercase tracking-wider text-center font-medium"
          style={{ color: tierColor }}
        >
          {trialActive && plan === "pro"
            ? `${trialDays} days left in trial`
            : "Your current plan"}
        </div>
        <button
          onClick={manage}
          disabled={loading}
          className="w-full h-11 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "Loading…" : "Manage subscription"}
        </button>
        {error && (
          <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (isLowerThanCurrent) {
    return (
      <div className="text-xs uppercase tracking-wider text-center text-[var(--color-text-faint)] pt-2">
        Included in {PLANS[userPlan].name}
      </div>
    );
  }

  // Upgrade CTA
  const ctaLabel =
    plan === "pro"
      ? trialActive
        ? "Continue with Pro"
        : userPlan === "free"
        ? "Start 7-day free trial"
        : PLANS[plan].ctaLabel
      : PLANS[plan].ctaLabel;

  return (
    <div className="space-y-2">
      <button
        onClick={upgrade}
        disabled={loading}
        className="btn-pulse w-full h-11 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-black"
        style={{ background: tierColor }}
      >
        {loading ? "Redirecting…" : ctaLabel}
      </button>
      {error && (
        <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
