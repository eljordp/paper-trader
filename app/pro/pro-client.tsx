"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/PortfolioProvider";

export default function ProClient() {
  const snapshot = usePortfolio();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = snapshot?.profile.is_pro ?? false;

  const upgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/checkout", { method: "POST" });
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

  if (isPro) {
    return (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-[var(--color-up)] text-center pt-2">
          You're on Pro
        </div>
        <button
          onClick={manage}
          disabled={loading}
          className="w-full h-11 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "Loading…" : "Manage subscription"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={upgrade}
        disabled={loading}
        className="w-full h-11 rounded-md bg-[var(--color-up)] text-black text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Upgrade to Pro"}
      </button>
      {error && (
        <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
