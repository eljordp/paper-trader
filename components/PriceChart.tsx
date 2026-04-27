"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import type { Candle, Range } from "@/lib/yahoo";
import { cn } from "@/lib/cn";

const RANGES: Range[] = ["1D", "5D", "1M", "3M", "1Y", "5Y"];

export default function PriceChart({ ticker, change }: { ticker: string; change: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<Range>("1M");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const up = change >= 0;
    const lineColor = up ? "#18c08f" : "#ff5566";
    const topColor = up ? "rgba(24,192,143,0.30)" : "rgba(255,85,102,0.30)";
    const bottomColor = up ? "rgba(24,192,143,0)" : "rgba(255,85,102,0)";

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#a3a3a3",
        fontFamily: "var(--font-jet), monospace",
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1a1a1a" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#232323" },
      timeScale: { borderColor: "#232323", timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [change]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/chart/${ticker}?range=${range}`)
      .then((r) => r.json())
      .then((data: { candles: Candle[] }) => {
        if (cancelled || !seriesRef.current) return;
        const points = (data.candles ?? []).map((c) => ({
          time: c.time as Time,
          value: c.close,
        }));
        seriesRef.current.setData(points);
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, range]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">Price chart</div>
        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-mono rounded transition-colors",
                range === r
                  ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                  : "text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-[320px] w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-xs text-[var(--color-text-faint)]">loading…</div>
        </div>
      )}
    </div>
  );
}
