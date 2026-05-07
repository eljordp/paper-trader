"use client";

import { useEffect, useRef } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { checkOrders } from "@/lib/actions";

/**
 * Invisible polling component — fires server-side checkOrders every 20s
 * if the user has any open pending orders.
 */
export default function OrderWatcher() {
  const snapshot = usePortfolio();
  const ticking = useRef(false);

  useEffect(() => {
    if (!snapshot?.activeAccount) return;
    if (!snapshot.openOrders || snapshot.openOrders.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      if (ticking.current) return;
      ticking.current = true;
      try {
        const res = await checkOrders();
        if (!cancelled && res.filled.length > 0) {
          for (const f of res.filled) {
            console.log(`[order] ${f.side} ${f.ticker} filled @ $${f.price.toFixed(2)}`);
          }
        }
      } catch {}
      ticking.current = false;
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
