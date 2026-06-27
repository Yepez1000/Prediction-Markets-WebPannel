import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/types";

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="min-w-0 rounded-md border border-border bg-card px-3 py-2"
        >
          <div className="truncate text-xs text-muted-foreground">{kpi.label}</div>
          <div
            className={cn(
              "mt-1 truncate font-mono text-lg font-semibold tabular-nums",
              kpi.tone === "profit" && "text-profit",
              kpi.tone === "loss" && "text-loss",
              kpi.tone === "caution" && "text-caution"
            )}
          >
            {kpi.value}
          </div>
          <div className="truncate text-xs text-muted-foreground">{kpi.detail}</div>
        </div>
      ))}
    </section>
  );
}
