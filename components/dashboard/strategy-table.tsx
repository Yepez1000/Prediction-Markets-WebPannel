import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StrategySummary } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function StrategyTable({
  strategies
}: {
  strategies: StrategySummary[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-primary">Strategy Comparison</CardTitle>
        <CardDescription>
          Family-level rollups split by mode, allocation, and container.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {strategies.length === 0 ? (
          <div className="rounded-md border border-dashed border-primary/35 bg-background/30 p-8 text-center font-mono text-sm text-muted-foreground">
            No strategy analytics events match the current filters.
          </div>
        ) : (
          <div className="space-y-3">
            {strategies.slice(0, 8).map((strategy) => {
              const width = Math.min(100, Math.max(8, Math.abs(strategy.winRate)));
              return (
                <div
                  key={`${strategy.strategy}-${strategy.allocationMode}-${strategy.instanceName}-${strategy.mode}`}
                  className="rounded-md border border-border/70 bg-background/45 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-medium">
                        {strategy.strategy}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{strategy.mode}</Badge>
                        <Badge variant="outline">{strategy.allocationMode}</Badge>
                        <Badge variant="outline">{strategy.instanceName}</Badge>
                      </div>
                    </div>
                    <div className={strategy.netPnl >= 0 ? "font-mono text-profit" : "font-mono text-loss"}>
                      {formatCurrency(strategy.netPnl)}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-4">
                    <span>{strategy.trades} trades</span>
                    <span>{formatPercent(strategy.winRate)} win rate</span>
                    <span>{formatCurrency(-strategy.fees)} fees</span>
                    <span>{strategy.skipped} skipped</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-muted">
                    <div
                      className={strategy.winRate >= 50 ? "h-1.5 rounded-full bg-profit" : "h-1.5 rounded-full bg-loss"}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
