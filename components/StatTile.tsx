import type { ReactNode } from "react";
import { TermLabel } from "./Tooltip";
import { cn } from "@/lib/cn";

export default function StatTile({
  label,
  value,
  termKey,
  hint,
  valueClass,
  large,
}: {
  label: string;
  value: ReactNode;
  termKey?: string;
  hint?: ReactNode;
  valueClass?: string;
  large?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {termKey ? <TermLabel termKey={termKey}>{label}</TermLabel> : label}
      </div>
      <div className={cn("font-mono tnum", large ? "text-xl" : "text-sm", valueClass)}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--color-text-faint)]">{hint}</div>}
    </div>
  );
}
