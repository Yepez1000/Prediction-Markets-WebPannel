"use client";

import { useMemo, useState } from "react";

import type { PnlPoint } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

export function PnlChart({ points }: { points: PnlPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chart = useMemo(() => buildChart(points), [points]);
  const active =
    activeIndex === null ? points.at(-1) : points[Math.min(activeIndex, points.length - 1)];

  if (points.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        No PnL points for this session yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-[#111315] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Profit/Loss
          </div>
          <div
            className={cn(
              "mt-2 font-mono text-3xl font-semibold tabular-nums",
              (active?.value ?? 0) >= 0 ? "text-primary" : "text-loss"
            )}
          >
            {formatCurrency(active?.value ?? 0)}
          </div>
        </div>
        {active ? (
          <div className="rounded-md border border-border bg-background/80 px-3 py-2 text-right font-mono text-xs">
            <div className="text-muted-foreground">
              {new Date(active.when).toLocaleString()}
            </div>
            <div className={active.delta >= 0 ? "text-profit" : "text-loss"}>
              {formatCurrency(active.delta)}
            </div>
            {active.price !== undefined ? (
              <div className="text-muted-foreground">
                price {active.price.toFixed(4)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-[300px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Session PnL over time"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          setActiveIndex(Math.round(ratio * (points.length - 1)));
        }}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id="pnl-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={chart.padding}
          x2={chart.width - chart.padding}
          y1={chart.zeroY}
          y2={chart.zeroY}
          stroke="currentColor"
          className="text-border"
          strokeDasharray="4 8"
        />
        <path d={chart.areaPath} fill="url(#pnl-area)" />
        <path
          d={chart.linePath}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {activeIndex !== null && chart.coordinates[activeIndex] ? (
          <>
            <line
              x1={chart.coordinates[activeIndex].x}
              x2={chart.coordinates[activeIndex].x}
              y1={chart.padding}
              y2={chart.height - chart.padding}
              stroke="rgb(148 163 184)"
              strokeOpacity="0.55"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={chart.coordinates[activeIndex].x}
              cy={chart.coordinates[activeIndex].y}
              r="4"
              fill="rgb(59 130 246)"
              stroke="rgb(17 19 21)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function buildChart(points: PnlPoint[]) {
  const width = 900;
  const height = 320;
  const padding = 18;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const xFor = (index: number) =>
    padding + (points.length <= 1 ? 0 : (index / (points.length - 1)) * innerWidth);
  const yFor = (value: number) => padding + ((max - value) / range) * innerHeight;
  const coordinates = points.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.value)
  }));
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates.at(-1)?.x ?? padding} ${
    height - padding
  } L ${padding} ${height - padding} Z`;

  return {
    width,
    height,
    padding,
    zeroY: yFor(0),
    coordinates,
    linePath,
    areaPath
  };
}
