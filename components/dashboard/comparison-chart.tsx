"use client";

import { useMemo, useState } from "react";

import type { ComparisonPnlPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function ComparisonChart({
  points,
  unit
}: {
  points: ComparisonPnlPoint[];
  unit: "usd" | "percent";
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chart = useMemo(() => buildChart(points), [points]);
  const active = points[Math.min(activeIndex ?? points.length - 1, points.length - 1)];
  if (points.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No comparable PnL points in this session window.
      </div>
    );
  }
  const display = (value: number) => unit === "percent" ? `${value.toFixed(2)}%` : formatCurrency(value);

  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-2 text-primary">
            <span className="size-2 rounded-full bg-primary" /> Ours {display(active?.ours ?? 0)}
          </span>
          <span className="flex items-center gap-2 text-source">
            <span className="size-2 rounded-full bg-source" /> Source {display(active?.source ?? 0)}
          </span>
        </div>
        {active ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {new Date(active.when).toLocaleString()}
          </span>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-[260px] w-full touch-none"
        preserveAspectRatio="none"
        role="img"
        aria-label="Our PnL compared with source wallet PnL"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          setActiveIndex(Math.round(ratio * (points.length - 1)));
        }}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <line x1="16" x2="884" y1={chart.zeroY} y2={chart.zeroY} className="text-border" stroke="currentColor" strokeDasharray="4 7" />
        <path d={chart.oursPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <path d={chart.sourcePath} fill="none" stroke="hsl(var(--source))" strokeWidth="2.5" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />
        {activeIndex !== null && chart.coordinates[activeIndex] ? (
          <line x1={chart.coordinates[activeIndex].x} x2={chart.coordinates[activeIndex].x} y1="16" y2="264" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{new Date(points[0].when).toLocaleString()}</span>
        <span>{new Date(points.at(-1)!.when).toLocaleString()}</span>
      </div>
    </div>
  );
}

function buildChart(points: ComparisonPnlPoint[]) {
  const width = 900;
  const height = 280;
  const padding = 16;
  const values = points.flatMap((point) => [point.ours, point.source]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const x = (index: number) => padding + index / Math.max(1, points.length - 1) * (width - padding * 2);
  const y = (value: number) => padding + (max - value) / range * (height - padding * 2);
  const coordinates = points.map((point, index) => ({ x: x(index), ours: y(point.ours), source: y(point.source) }));
  const path = (key: "ours" | "source") => coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point[key]}`).join(" ");
  return { width, height, zeroY: y(0), coordinates, oursPath: path("ours"), sourcePath: path("source") };
}
