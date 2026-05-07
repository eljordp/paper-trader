"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, TrendingUp } from "lucide-react";

type Result = { symbol: string; name: string; exchange: string; type: string };

const QUICK_TICKERS = [
  { sym: "NQ=F", label: "NQ — Nasdaq fut" },
  { sym: "ES=F", label: "ES — S&P fut" },
  { sym: "MNQ=F", label: "MNQ — Micro NQ" },
  { sym: "MES=F", label: "MES — Micro ES" },
  { sym: "GC=F", label: "GC — Gold fut" },
  { sym: "CL=F", label: "CL — Crude fut" },
  { sym: "SPY", label: "SPY — S&P ETF" },
  { sym: "QQQ", label: "QQQ — Nasdaq ETF" },
  { sym: "AAPL", label: "AAPL — Apple" },
  { sym: "TSLA", label: "TSLA — Tesla" },
  { sym: "NVDA", label: "NVDA — Nvidia" },
  { sym: "BTC-USD", label: "BTC — Bitcoin" },
];

export default function MobileSearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      // Focus when overlay opens
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    } else {
      setQ("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (Array.isArray(data)) setResults(data.slice(0, 12));
      } catch {}
      setLoading(false);
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const go = (sym: string) => {
    setQ("");
    setResults([]);
    onClose();
    router.push(`/trade/${encodeURIComponent(sym.toUpperCase())}`);
  };

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col">
      {/* Header with input */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (results[0]) go(results[0].symbol);
                else if (q.trim()) go(q.trim());
              } else if (e.key === "Escape") onClose();
            }}
            placeholder="Ticker, name, futures (NQ, ES, MES…)"
            autoComplete="off"
            inputMode="search"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md pl-10 pr-3 h-12 text-base placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
          />
        </div>
        <button
          onClick={onClose}
          className="h-12 px-3 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Results / quick picks */}
      <div className="flex-1 overflow-y-auto">
        {q.trim() ? (
          <div>
            {loading && results.length === 0 && (
              <div className="px-4 py-6 text-sm text-[var(--color-text-faint)]">Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div className="px-4 py-6 text-sm text-[var(--color-text-faint)]">
                No matches for &quot;{q}&quot;. Press Enter to try as a raw ticker.
              </div>
            )}
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => go(r.symbol)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left border-b border-[var(--color-border)] active:bg-[var(--color-surface)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-sm w-20 shrink-0">{r.symbol}</span>
                  <span className="text-sm text-[var(--color-text-dim)] truncate">
                    {r.name}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] shrink-0">
                  {r.exchange}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              Quick picks
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TICKERS.map((q) => (
                <button
                  key={q.sym}
                  onClick={() => go(q.sym)}
                  className="px-3 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] active:bg-[var(--color-surface-2)] text-left"
                >
                  <div className="font-mono text-sm text-[var(--color-text)]">{q.sym}</div>
                  <div className="text-[11px] text-[var(--color-text-faint)] mt-0.5 truncate">
                    {q.label.split("—")[1]?.trim() ?? ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
