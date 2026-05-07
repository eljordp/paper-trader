"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

/**
 * TradingView Advanced Real-Time Chart embed.
 * Free widget — supports candlesticks, indicators, drawing tools, replay, multiple timeframes.
 * Symbols map: stocks pass through, futures get exchange-prefix mapping (CME_MINI:NQ1! etc.)
 */
export default function TradingViewChart({
  ticker,
  height = 560,
}: {
  ticker: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef(`tv_${Math.random().toString(36).slice(2, 11)}`);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    setLoadError(null);

    const symbol = mapToTVSymbol(ticker);
    const containerEl = containerRef.current;
    if (!containerEl) return;

    // Reset container
    containerEl.innerHTML = "";

    // Create the inner div TradingView mounts into
    const innerDiv = document.createElement("div");
    innerDiv.id = widgetIdRef.current;
    innerDiv.style.height = "100%";
    innerDiv.style.width = "100%";
    containerEl.appendChild(innerDiv);

    const initWidget = () => {
      if (!window.TradingView || !containerRef.current) return;
      try {
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval: "15",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1", // candles
          locale: "en",
          backgroundColor: "rgba(11, 12, 16, 1)",
          gridColor: "rgba(35, 38, 49, 0.4)",
          enable_publishing: false,
          allow_symbol_change: false,
          save_image: false,
          studies: [],
          hide_volume: false,
          container_id: widgetIdRef.current,
        });
        setReady(true);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load chart");
      }
    };

    // If TradingView script is already loaded, just init
    if (window.TradingView) {
      initWidget();
      return;
    }

    // Otherwise inject the script
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://s3.tradingview.com/tv.js"]');
    if (existing) {
      existing.addEventListener("load", initWidget, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = initWidget;
    script.onerror = () => setLoadError("Couldn't load TradingView script");
    document.head.appendChild(script);
  }, [ticker]);

  return (
    <div className="relative w-full bg-[var(--color-bg)] rounded-lg overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-xs text-[var(--color-text-faint)]">Loading TradingView…</div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-[var(--color-down)]">{loadError}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Map our internal ticker (Yahoo format) to TradingView's exchange-prefixed symbol.
 * Futures (=F suffix) need exchange mapping. Stocks pass through.
 */
function mapToTVSymbol(ticker: string): string {
  const t = ticker.toUpperCase();

  // Index futures (CME)
  const cmeMini: Record<string, string> = {
    "ES=F": "CME_MINI:ES1!",
    "NQ=F": "CME_MINI:NQ1!",
    "RTY=F": "CME_MINI:RTY1!",
    "MES=F": "CME_MINI:MES1!",
    "MNQ=F": "CME_MINI:MNQ1!",
    "M2K=F": "CME_MINI:M2K1!",
  };
  if (cmeMini[t]) return cmeMini[t];

  // CBOT (Dow)
  const cbot: Record<string, string> = {
    "YM=F": "CBOT_MINI:YM1!",
    "MYM=F": "CBOT_MINI:MYM1!",
  };
  if (cbot[t]) return cbot[t];

  // COMEX (metals)
  const comex: Record<string, string> = {
    "GC=F": "COMEX:GC1!",
    "MGC=F": "COMEX:MGC1!",
    "SI=F": "COMEX:SI1!",
    "HG=F": "COMEX:HG1!",
  };
  if (comex[t]) return comex[t];

  // NYMEX (energy)
  const nymex: Record<string, string> = {
    "CL=F": "NYMEX:CL1!",
    "MCL=F": "NYMEX:MCL1!",
    "NG=F": "NYMEX:NG1!",
    "MNG=F": "NYMEX:MNG1!",
  };
  if (nymex[t]) return nymex[t];

  // Generic =F fallback (try CME_MINI prefix)
  if (t.endsWith("=F")) {
    const base = t.slice(0, -2);
    return `CME_MINI:${base}1!`;
  }

  // Crypto (BTC-USD style → BINANCE:BTCUSDT)
  if (t.endsWith("-USD")) {
    const base = t.slice(0, -4);
    return `BINANCE:${base}USDT`;
  }

  // Forex (EURUSD=X → FX:EURUSD)
  if (t.endsWith("=X")) {
    return `FX:${t.slice(0, -2)}`;
  }

  // Stocks: TradingView resolves automatically from any major exchange
  return t;
}
