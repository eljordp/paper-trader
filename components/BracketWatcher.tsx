"use client";

import { useEffect, useRef } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { checkBrackets } from "@/lib/actions";

/**
 * Invisible client component that polls server for bracket order triggers.
 * Mounted globally in layout — only fires when user has positions with SL/TP.
 */
export default function BracketWatcher() {
  const snapshot = usePortfolio();
  const tickingRef = useRef(false);

  useEffect(() => {
    if (!snapshot?.activeAccount) return;
    const hasBrackets = snapshot.positions.some(
      (p) => p.stop_loss != null || p.take_profit != null
    );
    if (!hasBrackets) return;

    let cancelled = false;
    const tick = async () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      try {
        const res = await checkBrackets();
        if (!cancelled && res.triggered.length > 0) {
          // Server revalidated; UI will refresh on next render
          for (const t of res.triggered) {
            console.log(`[bracket] ${t.reason} triggered on ${t.ticker} @ $${t.price.toFixed(2)}`);
          }
        }
      } catch {}
      tickingRef.current = false;
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [snapshot]);

  return null;
}
