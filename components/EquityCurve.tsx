"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

type Snapshot = {
  recorded_at: string;
  equity: number;
};

export default function EquityCurve({
  snapshots,
  startingCash,
}: {
  snapshots: Snapshot[];
  startingCash: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (snapshots.length === 0) return;

    const lastEquity = Number(snapshots[snapshots.length - 1].equity);
    const up = lastEquity >= startingCash;
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

    const series: ISeriesApi<"Area"> = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
    });

    // Add a baseline at starting cash
    series.createPriceLine({
      price: startingCash,
      color: "#444444",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "start",
    });

    const points = snapshots.map((s) => ({
      time: Math.floor(new Date(s.recorded_at).getTime() / 1000) as Time,
      value: Number(s.equity),
    }));
    series.setData(points);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [snapshots, startingCash]);

  if (snapshots.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-12 text-center">
        <div className="text-[var(--color-text-dim)] mb-1">No trades yet</div>
        <div className="text-xs text-[var(--color-text-faint)]">Your equity curve appears here after your first trade.</div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-[280px] w-full" />;
}
