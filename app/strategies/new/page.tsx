import StrategyForm from "../strategy-form";

export default function NewStrategyPage() {
  return (
    <div className="max-w-[700px] mx-auto px-6 py-8 space-y-8">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          New strategy
        </div>
        <h1 className="font-serif text-5xl mt-1">Define a setup</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          Be specific. Vague strategies produce vague results.
          The brain reads these rules — the better you describe, the better the coaching.
        </p>
      </div>

      <StrategyForm mode="create" />
    </div>
  );
}
