import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { MarketPositionSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function MarketPositions({
  positions
}: {
  positions: MarketPositionSummary[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Market positions</CardTitle>
        <CardDescription>
          Reconstructed from fills using average cost basis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No filled market positions loaded for this session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Market</th>
                  <th className="py-2 text-right font-medium">Bought</th>
                  <th className="py-2 text-right font-medium">Avg buy</th>
                  <th className="py-2 text-right font-medium">Sold</th>
                  <th className="py-2 text-right font-medium">Avg sell</th>
                  <th className="py-2 text-right font-medium">Open</th>
                  <th className="py-2 text-right font-medium">Fees</th>
                  <th className="py-2 text-right font-medium">Realized</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.key} className="border-b border-border/70 align-top">
                    <td className="max-w-[360px] py-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {position.market}
                        </span>
                        {position.polymarketUrl ? (
                          <Link
                            href={position.polymarketUrl}
                            target="_blank"
                            className="shrink-0 text-primary hover:text-primary/80"
                            aria-label="Open Polymarket search"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                        ) : null}
                      </div>
                      {position.outcome || position.asset ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                          {position.outcome ? (
                            <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-foreground">
                              {position.outcome}
                            </span>
                          ) : null}
                          {position.asset ? <span>{position.asset.slice(0, 10)}...</span> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatShares(position.boughtShares)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatPrice(position.averageBuyPrice)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatShares(position.soldShares)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatPrice(position.averageSellPrice)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatShares(position.openShares)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {formatCurrency(-position.fees)}
                    </td>
                    <td
                      className={
                        position.realizedPnl >= 0
                          ? "py-2 text-right font-mono text-profit"
                          : "py-2 text-right font-mono text-loss"
                      }
                    >
                      {formatCurrency(position.realizedPnl)}
                    </td>
                    <td className="py-2">
                      <Badge variant={position.resolved ? "secondary" : "outline"}>
                        {position.resolved ? "resolved" : "open"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatShares(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  return `$${value.toFixed(4)}`;
}
