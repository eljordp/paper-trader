import Link from "next/link";
import { FIRM_PROFILES, FIRM_PROFILE_ORDER } from "@/lib/firmProfiles";
import EvalProfilesClient from "./profiles-client";

export const dynamic = "force-dynamic";

export default function EvalProfilesPage() {
  const profiles = FIRM_PROFILE_ORDER.map((id) => FIRM_PROFILES[id]);
  const byFirm = profiles.reduce<Record<string, typeof profiles>>((acc, p) => {
    if (!acc[p.firm]) acc[p.firm] = [];
    acc[p.firm].push(p);
    return acc;
  }, {});

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-10">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Eval profiles
        </div>
        <h1 className="font-serif text-5xl mt-1">Practice the real firms</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          Each profile mirrors the actual published rules of the firm. Trailing drawdown,
          dollar-based daily loss limits, consistency rules — all enforced.
          Pass the sim eval before you pay $99–$1,080 for the real one.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-xs text-[var(--color-text-dim)] max-w-prose">
        <span className="text-[var(--color-text)]">Heads up:</span> rules are best-effort
        approximations of each firm&apos;s public docs as of 2026. Always verify against the
        firm&apos;s current rules before paying for a real eval. We are not affiliated with
        FTMO, Apex, Topstep, or MyFundedFutures.
      </div>

      {Object.entries(byFirm).map(([firm, list]) => {
        const firmDisplay = list[0].firmDisplay;
        return (
          <section key={firm} className="space-y-4">
            <h2 className="font-serif text-3xl">{firmDisplay}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {list.map((p) => (
                <EvalProfilesClient key={p.id} profile={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
