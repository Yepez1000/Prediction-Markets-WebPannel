import { AlertTriangle, ArrowDownRight, ArrowUpRight, GitCompareArrows } from "lucide-react";
import Link from "next/link";

import { ComparisonChart } from "@/components/dashboard/comparison-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionComparison } from "@/lib/reconciliation";
import type {
  DashboardFilters,
  PositionReconciliation,
  PositionVerdict,
  SessionComparison as SessionComparisonData
} from "@/lib/types";
import { cn, formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

export async function SessionComparison({
  sessionId,
  filters,
  comparisonPromise
}: {
  sessionId: string;
  filters: DashboardFilters;
  comparisonPromise?: Promise<SessionComparisonData | undefined>;
}) {
  const comparison = await (comparisonPromise ?? getSessionComparison(sessionId, filters));
  if (!comparison) return null;
  if (comparison.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-caution" /> Wallet comparison unavailable</CardTitle>
          <CardDescription>{comparison.error} Core session analytics are unaffected.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const series = filters.pnlView === "realized" ? comparison.realizedSeries : comparison.series;
  const value = (amount: number) => comparison.unit === "percent" ? `${amount.toFixed(2)}%` : formatCurrency(amount);

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="wallet-comparison-title">
      <Card>
        <CardHeader className="border-b border-border/70 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle id="wallet-comparison-title" className="flex items-center gap-2">
                <GitCompareArrows className="size-4 text-primary" /> Copy fidelity
              </CardTitle>
              <CardDescription className="mt-1">
                Session versus source {shortWallet(comparison.sourceWallet)} · {new Date(comparison.startedAt).toLocaleString()} onward
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              <Toggle filters={filters} field="pnlView" value="mark" label="Mark-to-market" />
              <Toggle filters={filters} field="pnlView" value="realized" label="Realized" />
              <Toggle filters={filters} field="sourceScope" value="matched" label="Matched markets" />
              <Toggle filters={filters} field="sourceScope" value="wallet" label="Full wallet" />
              <Toggle filters={filters} field="pnlUnit" value="usd" label="$" />
              <Toggle filters={filters} field="pnlUnit" value="percent" label="%" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="PnL gap" value={value(comparison.summary.pnlGap)} tone={comparison.summary.pnlGap >= 0 ? "profit" : "loss"} />
            <Stat label="Matched" value={comparison.summary.matchedPositions.toString()} />
            <Stat label="Source only" value={comparison.summary.sourceOnlyPositions.toString()} tone={comparison.summary.sourceOnlyPositions ? "caution" : undefined} />
            <Stat label="Wrong outcome" value={comparison.summary.wrongOutcomePositions.toString()} tone={comparison.summary.wrongOutcomePositions ? "loss" : undefined} />
            <Stat label="Median entry lag" value={formatDuration(comparison.summary.medianEntryLagSeconds)} />
            <Stat label="Median exit lag" value={formatDuration(comparison.summary.medianExitLagSeconds)} />
          </div>
          <ComparisonChart points={series} unit={comparison.unit} />
          {comparison.warnings.length || comparison.truncated ? (
            <div className="rounded-md border border-caution/20 bg-caution/5 px-3 py-2 text-xs text-caution">
              {[...comparison.warnings, ...(comparison.truncated ? ["Polymarket pagination reached its 10,000-offset limit; results are partial."] : [])].join(" ")}
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <PositionTable positions={comparison.positions} />
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alpha-gap evidence</div>
              <div className="grid gap-2">
                {comparison.summary.factors.map((factor) => (
                  <div key={factor.label} className="rounded-md border border-border/70 bg-muted/20 p-2.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">{factor.label}</span>
                      <span className={cn("font-mono tabular-nums", factor.impact >= 0 ? "text-profit" : "text-loss")}>
                        {factor.impact >= 0 ? <ArrowUpRight className="mr-1 inline size-3" /> : <ArrowDownRight className="mr-1 inline size-3" />}
                        {formatCurrency(factor.impact)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{factor.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="text-right font-mono text-[10px] text-muted-foreground">External data refreshed {new Date(comparison.updatedAt).toLocaleString()} · cached 60s</div>
        </CardContent>
      </Card>
    </section>
  );
}

function Toggle({ filters, field, value, label }: { filters: DashboardFilters; field: "pnlView" | "sourceScope" | "pnlUnit"; value: string; label: string }) {
  const defaults = { pnlView: "mark", sourceScope: "matched", pnlUnit: "usd" };
  const active = (filters[field] ?? defaults[field]) === value;
  const params = new URLSearchParams();
  for (const [key, current] of Object.entries({ ...filters, [field]: value })) if (current && current !== "all") params.set(key, current);
  return <Button asChild size="sm" variant={active ? "default" : "outline"}><Link href={`/?${params}`}>{label}</Link></Button>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" | "caution" }) {
  return <div className="bg-card px-3 py-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className={cn("mt-1 font-mono text-sm tabular-nums", tone === "profit" && "text-profit", tone === "loss" && "text-loss", tone === "caution" && "text-caution")}>{value}</div></div>;
}

function PositionTable({ positions }: { positions: PositionReconciliation[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Market / outcome</th><th className="px-2 py-2 text-right">Ours / target</th><th className="px-2 py-2 text-right">Source now</th><th className="px-2 py-2 text-right">Fill</th><th className="px-2 py-2 text-right">Entry lag</th><th className="px-2 py-2 text-right">Exit lag</th><th className="px-2 py-2 text-right">PnL gap</th><th className="px-3 py-2">Verdict</th></tr></thead>
        <tbody className="divide-y divide-border/70">
          {positions.map((position) => (
            <tr key={position.key} className="bg-card hover:bg-muted/20">
              <td className="max-w-[300px] px-3 py-2"><div className="truncate text-foreground">{position.market}</div><div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{position.outcome || "unknown"} · {position.conditionId.slice(0, 10)}…</div></td>
              <td className="px-2 py-2 text-right font-mono">{shares(position.ourCurrentShares)} / {shares(position.expectedShares)}</td>
              <td className="px-2 py-2 text-right font-mono text-source">{shares(position.sourceCurrentShares)}</td>
              <td className="px-2 py-2 text-right font-mono">{position.fillPercent === undefined ? "n/a" : formatPercent(position.fillPercent)}</td>
              <td className="px-2 py-2 text-right font-mono">{formatDuration(position.entryLagSeconds)}</td>
              <td className="px-2 py-2 text-right font-mono">{formatDuration(position.exitLagSeconds)}</td>
              <td className={cn("px-2 py-2 text-right font-mono", (position.pnlGap ?? 0) >= 0 ? "text-profit" : "text-loss")}>{position.pnlGap === undefined ? "n/a" : formatCurrency(position.pnlGap)}</td>
              <td className="px-3 py-2"><Verdict verdict={position.verdict} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {positions.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No comparable positions.</div> : null}
    </div>
  );
}

function Verdict({ verdict }: { verdict: PositionVerdict }) {
  const variant = verdict === "matched" ? "profit" : verdict === "partial" || verdict === "unsupported" ? "caution" : "loss";
  return <Badge variant={variant}>{verdict}</Badge>;
}

function shares(value: number) { return value.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function formatDuration(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "+";
  const amount = Math.abs(value);
  if (amount < 60) return `${sign}${amount.toFixed(1)}s`;
  return `${sign}${(amount / 60).toFixed(1)}m`;
}

export function SessionComparisonSkeleton() {
  return <Card><CardHeader><CardTitle>Copy fidelity</CardTitle><CardDescription>Loading source-wallet activity and price history…</CardDescription></CardHeader><CardContent><div className="h-72 animate-pulse rounded-md border border-border bg-muted/20" /></CardContent></Card>;
}
