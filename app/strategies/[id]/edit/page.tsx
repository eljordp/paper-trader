import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getStrategy } from "@/lib/strategies";
import StrategyForm from "../../strategy-form";

export default async function EditStrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getStrategy(id);
  if (!s) notFound();

  return (
    <div className="max-w-[700px] mx-auto px-6 py-8 space-y-8">
      <Link
        href={`/strategies/${id}`}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
      >
        <ArrowLeft className="w-3 h-3" /> {s.name}
      </Link>
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Edit strategy
        </div>
        <h1 className="font-serif text-5xl mt-1">{s.name}</h1>
      </div>
      <StrategyForm
        mode="edit"
        initial={{
          id: s.id,
          name: s.name,
          description: s.description,
          entry_rules: s.entry_rules,
          exit_rules: s.exit_rules,
          size_rules: s.size_rules,
          time_window: s.time_window,
          instruments: s.instruments,
        }}
      />
    </div>
  );
}
