import { Activity, CircleDollarSign, Percent, RadioTower } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/types";

const icons = [CircleDollarSign, Activity, Percent, RadioTower];

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="grid metric-grid min-w-0 gap-3">
      {kpis.map((kpi, index) => {
        const Icon = icons[index % icons.length];
        return (
          <Card key={kpi.label} className="min-w-0 bg-card/75">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="terminal-label text-xs uppercase">
                  {kpi.label}
                </span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div
                className={cn(
                  "mt-2 font-mono text-2xl font-semibold tabular-nums",
                  kpi.tone === "profit" && "text-profit",
                  kpi.tone === "loss" && "text-loss",
                  kpi.tone === "caution" && "text-caution"
                )}
              >
                {kpi.value}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {kpi.detail}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
