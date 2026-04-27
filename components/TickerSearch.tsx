"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Result = { symbol: string; name: string; exchange: string; type: string };

export default function TickerSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (Array.isArray(data)) setResults(data.slice(0, 8));
      } catch {}
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const go = (sym: string) => {
    setQ("");
    setOpen(false);
    setResults([]);
    router.push(`/trade/${sym.toUpperCase()}`);
  };

  return (
    <div ref={wrap} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) go(results[active].symbol);
              else if (q.trim()) go(q.trim());
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search tickers (AAPL, TSLA, NVDA…)"
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md pl-9 pr-3 h-9 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-md shadow-2xl z-50 overflow-hidden">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.symbol)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                i === active ? "bg-[var(--color-surface-2)]" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-[var(--color-text)] w-14 shrink-0">{r.symbol}</span>
                <span className="text-[var(--color-text-dim)] truncate">{r.name}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] ml-2">
                {r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
