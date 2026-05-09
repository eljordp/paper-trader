"use client";

import { useEffect, useRef } from "react";
import { usePortfolio } from "./PortfolioProvider";

export default function AILiveWatcher() {
  const snapshot = usePortfolio();
  const ticking = useRef(false);

  useEffect(() => {
    if (!snapshot?.activeAccount) return;
    let cancelled = false;
    const tick = async () => {
      if (ticking.current) return;
      ticking.current = true;
      try {
        const r = await fetch("/api/ai-lab/check-signals", { method: "POST" });
        if (r.ok) {
          const data = await r.json();
          if (!cancelled && data.fired?.length > 0) {
            for (const f of data.fired) {
              console.log(`[ai-lab] ${f.side} fired on ${f.ticker} @ $${f.price.toFixed(2)}`);
            }
          }
        }
      } catch {}
      ticking.current = false;
    };
    const initial = setTimeout(tick, 5000);
    const interval = setInterval(tick, 60000);
    return () => { cancelled = true; clearTimeout(initial); clearInterval(interval); };
  }, [snapshot?.activeAccount?.id]);

  return null;
}
