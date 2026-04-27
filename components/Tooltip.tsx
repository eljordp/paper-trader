"use client";

import { useState, type ReactNode } from "react";
import { explain } from "@/lib/glossary";

export function Tooltip({ children, content }: { children: ReactNode; content: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 px-3 py-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-md text-xs text-[var(--color-text)] shadow-2xl">
          {content}
        </span>
      )}
    </span>
  );
}

export function TermLabel({ termKey, children }: { termKey: string; children: ReactNode }) {
  const entry = explain(termKey);
  if (!entry) return <>{children}</>;
  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="font-medium">{entry.term}</div>
          <div className="text-[var(--color-text-dim)]">{entry.short}</div>
          {entry.example && (
            <div className="text-[var(--color-text-faint)] italic pt-1">{entry.example}</div>
          )}
        </div>
      }
    >
      <span className="border-b border-dotted border-[var(--color-text-faint)] cursor-help">{children}</span>
    </Tooltip>
  );
}
