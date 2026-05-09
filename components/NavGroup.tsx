"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type NavGroupChild = { href: string; label: string; description?: string };

export default function NavGroup({
  label,
  children,
}: {
  label: string;
  children: NavGroupChild[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "px-3 py-1.5 text-sm rounded-md transition-colors inline-flex items-center gap-1",
          active
            ? "text-[var(--color-text)] bg-[var(--color-surface)]"
            : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 min-w-[220px] rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden z-50"
          role="menu"
        >
          {children.map((c) => {
            const isActive = pathname === c.href || pathname.startsWith(c.href + "/");
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block px-4 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--color-bg)] text-[var(--color-text)]"
                    : "text-[var(--color-text-dim)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]",
                )}
              >
                <div className="font-medium">{c.label}</div>
                {c.description && (
                  <div className="text-xs text-[var(--color-text-faint)] mt-0.5">
                    {c.description}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
