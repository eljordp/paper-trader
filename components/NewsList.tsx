"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { NewsItem } from "@/lib/yahoo";
import { ArrowUpRight } from "lucide-react";

export default function NewsList({ symbol, limit }: { symbol?: string; limit?: number }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = symbol ? `/api/news?symbol=${symbol}` : `/api/news`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setItems(limit ? data.slice(0, limit) : data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, limit]);

  if (loading) {
    return <div className="text-xs text-[var(--color-text-faint)] py-4">loading news…</div>;
  }
  if (items.length === 0) {
    return <div className="text-xs text-[var(--color-text-faint)] py-4">No news available.</div>;
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {items.map((n) => (
        <a
          key={n.uuid}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex gap-4 py-4 hover:bg-[var(--color-surface)] -mx-3 px-3 rounded transition-colors"
        >
          {n.thumbnail && (
            <img
              src={n.thumbnail}
              alt=""
              className="w-20 h-20 object-cover rounded shrink-0 bg-[var(--color-surface-2)]"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm leading-snug group-hover:underline decoration-[var(--color-text-faint)] underline-offset-2">
              {n.title}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]">
              <span>{n.publisher}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(n.publishedAt), { addSuffix: true })}</span>
              {n.relatedTickers.length > 0 && (
                <>
                  <span>·</span>
                  <span className="font-mono">{n.relatedTickers.slice(0, 3).join(" ")}</span>
                </>
              )}
            </div>
          </div>
          <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      ))}
    </div>
  );
}
