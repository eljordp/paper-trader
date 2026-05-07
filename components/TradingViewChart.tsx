"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TradingView Advanced Real-Time Chart embed.
 * Uses the official `embed-widget-advanced-chart.js` script (more reliable than tv.js).
 * Symbols: stocks pass through, futures get exchange-prefix mapping (CME_MINI:NQ1! etc.)
 */
export default function TradingViewChart({
  ticker,
  height = 560,
}: {
  ticker: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const symbol = mapToTVSymbol(ticker);

    // Reset
    container.innerHTML = "";
    setLoadError(null);

    // TradingView's official embed widget pattern: a container div + a script tag with config as JSON
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";
    container.appendChild(widgetContainer);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_top_toolbar: false,
      hide_legend: false,
      backgroundColor: "rgba(11, 12, 16, 1)",
      gridColor: "rgba(35, 38, 49, 0.4)",
      withdateranges: true,
      allow_symbol_change: false,
      details: false,
      hotlist: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    script.onerror = () => setLoadError("Couldn't load TradingView widget");
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [ticker]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div
        ref={containerRef}
        className="tradingview-widget-container w-full h-full bg-[var(--color-bg)] rounded-lg overflow-hidden"
      />
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]">
          <div className="text-xs text-[var(--color-down)]">{loadError}</div>
        </div>
      )}
    </div>
  );
}

function mapToTVSymbol(ticker: string): string {
  // Defensive: decode in case URL-encoded form leaked through (e.g. NQ%3DF → NQ=F)
  let t = ticker;
  try {
    if (t.includes("%")) t = decodeURIComponent(t);
  } catch {
    /* keep raw */
  }
  t = t.toUpperCase();

  const cmeMini: Record<string, string> = {
    "ES=F": "CME_MINI:ES1!",
    "NQ=F": "CME_MINI:NQ1!",
    "RTY=F": "CME_MINI:RTY1!",
    "MES=F": "CME_MINI:MES1!",
    "MNQ=F": "CME_MINI:MNQ1!",
    "M2K=F": "CME_MINI:M2K1!",
  };
  if (cmeMini[t]) return cmeMini[t];

  const cbot: Record<string, string> = {
    "YM=F": "CBOT_MINI:YM1!",
    "MYM=F": "CBOT_MINI:MYM1!",
  };
  if (cbot[t]) return cbot[t];

  const comex: Record<string, string> = {
    "GC=F": "COMEX:GC1!",
    "MGC=F": "COMEX:MGC1!",
    "SI=F": "COMEX:SI1!",
    "HG=F": "COMEX:HG1!",
  };
  if (comex[t]) return comex[t];

  const nymex: Record<string, string> = {
    "CL=F": "NYMEX:CL1!",
    "MCL=F": "NYMEX:MCL1!",
    "NG=F": "NYMEX:NG1!",
  };
  if (nymex[t]) return nymex[t];

  if (t.endsWith("=F")) {
    const base = t.slice(0, -2);
    return `CME_MINI:${base}1!`;
  }

  if (t.endsWith("-USD")) {
    const base = t.slice(0, -4);
    return `BINANCE:${base}USDT`;
  }

  if (t.endsWith("=X")) {
    return `FX:${t.slice(0, -2)}`;
  }

  return t;
}
