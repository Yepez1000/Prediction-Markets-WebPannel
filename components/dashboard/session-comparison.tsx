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
import { cn, formatCurrency, shortWallet } from "@/lib/utils";

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
  const pnlGapPct = comparison.summary.pnlGapPct;
  const absPnlGap = comparison.summary.pnlGap;

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
            <Stat label="PnL gap %" value={pnlGapPct !== undefined ? `${pnlGapPct >= 0 ? "+" : ""}${pnlGapPct.toFixed(2)}%` : "n/a"} tone={pnlGapPct !== undefined && pnlGapPct >= 0 ? "profit" : "loss"} />
            <Stat label="PnL gap ($)" value={formatCurrency(absPnlGap)} tone={absPnlGap >= 0 ? "profit" : "loss"} />
            <Stat label="Matched" value={comparison.summary.matchedPositions.toString()} />
            <Stat label="Source only" value={comparison.summary.sourceOnlyPositions.toString()} tone={comparison.summary.sourceOnlyPositions ? "caution" : undefined} />
            <Stat label="Median entry lag" value={formatDuration(comparison.summary.medianEntryLagSeconds)} />
            <Stat label="Median exit lag" value={formatDuration(comparison.summary.medianExitLagSeconds)} />
          </div>
          <ComparisonChart points={series} unit={comparison.unit} />
          <ReturnDerivation comparison={comparison} />
          {comparison.warnings.length || comparison.truncated ? (
            <div className="rounded-md border border-caution/20 bg-caution/5 px-3 py-2 text-xs text-caution">
              {[...comparison.warnings, ...(comparison.truncated ? ["Polymarket pagination reached its 10,000-offset limit; results are partial."] : [])].join(" ")}
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <PositionTable positions={comparison.positions} />
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Return-gap evidence · estimated</div>
              <div className="grid gap-2">
                {comparison.summary.factors.map((factor) => (
                  <div key={factor.label} className="rounded-md border border-border/70 bg-muted/20 p-2.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">{factor.label}</span>
                      <span className={cn("font-mono tabular-nums", factor.impact >= 0 ? "text-profit" : "text-loss")}>
                        {factor.impact >= 0 ? <ArrowUpRight className="mr-1 inline size-3" /> : <ArrowDownRight className="mr-1 inline size-3" />}
                        {factor.unit === "pp" ? `${factor.impact >= 0 ? "+" : ""}${factor.impact.toFixed(2)} pp` : formatCurrency(factor.impact)}
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
      <table className="w-full min-w-[1800px] text-left text-xs">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Market / outcome</th><th className="px-2 py-2 text-right">Proportional sizing</th><th className="px-2 py-2 text-right">Entry · source → ours</th><th className="px-2 py-2 text-right">Exit · source → ours</th><th className="px-2 py-2 text-right">Source result</th><th className="px-2 py-2 text-right">Our result</th><th className="px-2 py-2 text-right">Return bridge</th><th className="px-2 py-2 text-right">Running return</th><th className="px-3 py-2">Diagnosis</th></tr></thead>
        <tbody className="divide-y divide-border/70">
          {positions.map((position) => (
            <tr key={position.key} className="bg-card hover:bg-muted/20">
              <td className="min-w-[360px] max-w-[460px] px-3 py-2 align-top">
                <div className="whitespace-normal break-words text-foreground">{position.market}</div>
                <div className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {position.outcome || "unknown"} · condition {position.conditionId}
                </div>
                {position.asset ? <div className="mt-0.5 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">token {position.asset}</div> : null}
              </td>
              <td className="px-2 py-2"><SizingEquation position={position} /></td>
              <td className="px-2 py-2"><PricePair source={position.sourceEntryPrice} ours={position.ourEntryPrice} delta={position.entryPriceDelta} pnl={position.entryDelayPnl} lagSeconds={position.entryLagSeconds} /></td>
              <td className="px-2 py-2"><PricePair source={position.sourceExitPrice} ours={position.ourExitPrice} delta={position.exitPriceDelta} pnl={position.exitDelayPnl} lagSeconds={position.exitLagSeconds} lifecycleOffsetSeconds={position.exitEventOffsetSeconds} lifecycleType={position.sourceExitType} /></td>
              <td className="px-2 py-2"><TradeResult owner="source" pnl={position.sourcePnl} capital={position.sourceBuyCapital} roi={position.sourceTradeReturnPct} contribution={position.sourceReturnContributionPct} /></td>
              <td className="px-2 py-2"><TradeResult owner="ours" pnl={position.ourPnl} capital={position.ourBuyCapital} roi={position.ourTradeReturnPct} contribution={position.ourReturnContributionPct} fees={position.ourFees} /></td>
              <td className="px-2 py-2 text-right font-mono"><SignedPercent value={position.returnGapContributionPct} suffix=" pp" /><div className="mt-0.5 text-[10px] text-muted-foreground">ours − source</div></td>
              <td className="px-2 py-2 text-right font-mono"><div className="text-source">S <SignedPercent value={position.cumulativeSourceReturnPct} /></div><div className="mt-0.5 text-primary">O <SignedPercent value={position.cumulativeOurReturnPct} /></div></td>
              <td className="px-3 py-2"><Diagnosis position={position} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {positions.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No comparable positions.</div> : null}
    </div>
  );
}

function ReturnDerivation({ comparison }: { comparison: SessionComparisonData }) {
  const { summary } = comparison;
  return (
    <div className="grid overflow-hidden rounded-md border border-border bg-border lg:grid-cols-[1fr_1fr_1.2fr]">
      <ReturnFormula owner="source" pnl={summary.sourcePnl} capital={summary.sourceGrossBuyCapital} result={summary.sourceReturnPct} residual={summary.sourceAttributionResidual} />
      <ReturnFormula owner="ours" pnl={summary.ourPnl} capital={summary.ourGrossBuyCapital} result={summary.ourReturnPct} residual={summary.ourAttributionResidual} />
      <div className="bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <div className="font-semibold text-foreground">How the endpoint is built</div>
        <p className="mt-1">Each row contributes <span className="font-mono text-foreground">position PnL ÷ all gross buy capital</span>. Contributions add to the chart endpoint. Individual trade ROI is diagnostic only—it is not added or compounded.</p>
      </div>
    </div>
  );
}

function ReturnFormula({ owner, pnl, capital, result, residual }: { owner: "source" | "ours"; pnl: number; capital: number; result?: number; residual: number }) {
  return (
    <div className="bg-card px-4 py-3 font-mono tabular-nums">
      <div className={cn("text-[10px] uppercase tracking-wide", owner === "source" ? "text-source" : "text-primary")}>{owner} endpoint</div>
      <div className="mt-1 text-sm">{formatCurrency(pnl)} ÷ {formatCurrency(capital)} = <SignedPercent value={result} /></div>
      <div className="mt-1 text-[10px] text-muted-foreground">row tie-out residual {formatCurrency(residual)}</div>
    </div>
  );
}

function SizingEquation({ position }: { position: PositionReconciliation }) {
  if (position.sourceSignalShares === undefined || position.portfolioSizingPct === undefined) {
    return <div className="text-right font-mono text-muted-foreground">n/a</div>;
  }
  return (
    <div className="min-w-[210px] text-right font-mono tabular-nums">
      <div><span className="text-source">{shares(position.sourceSignalShares)}</span> × {(position.portfolioSizingPct * 100).toFixed(4)}% = <span className="text-foreground">{shares(position.proportionalTargetShares ?? 0)}</span></div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">recorded target {shares(position.expectedShares)} → <span className="text-primary">peak {shares(position.ourPeakShares)}</span>{position.ourBoughtShares !== position.ourPeakShares ? ` · gross bought ${shares(position.ourBoughtShares)}` : ""}</div>
    </div>
  );
}

function TradeResult({ owner, pnl, capital, roi, contribution, fees }: { owner: "source" | "ours"; pnl?: number; capital?: number; roi?: number; contribution?: number; fees?: number }) {
  if (!capital) return <div className="text-right font-mono text-muted-foreground">n/a</div>;
  return (
    <div className="min-w-[155px] text-right font-mono tabular-nums">
      <div className={cn((pnl ?? 0) >= 0 ? "text-profit" : "text-loss")}>{formatCurrency(pnl ?? 0)} <span className="text-muted-foreground">on {formatCurrency(capital)}</span></div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">ROI <SignedPercent value={roi} /> · adds <SignedPercent value={contribution} suffix=" pp" /></div>
      {owner === "ours" && fees ? <div className="mt-0.5 text-[10px] text-caution">fees {formatCurrency(-Math.abs(fees))}</div> : null}
    </div>
  );
}

function SignedPercent({ value, suffix = "%" }: { value?: number; suffix?: string }) {
  if (value === undefined || !Number.isFinite(value)) return <>n/a</>;
  return <span className={cn(value >= 0 ? "text-profit" : "text-loss")}>{value >= 0 ? "+" : ""}{value.toFixed(2)}{suffix}</span>;
}

function Diagnosis({ position }: { position: PositionReconciliation }) {
  const reasons: string[] = [];
  if (position.verdict === "source-only" || position.verdict === "wrong-outcome") reasons.push("selection");
  if (position.proportionalTargetShares !== undefined && Math.abs(position.ourPeakShares - position.proportionalTargetShares) >= 0.75) reasons.push("sizing");
  if ((position.entryDelayPnl ?? 0) < -0.01) reasons.push("entry drag");
  if ((position.exitDelayPnl ?? 0) < -0.01) reasons.push("exit drag");
  if ((position.ourFees ?? 0) > 0.01) reasons.push("fees");
  return <div className="min-w-[130px]"><Verdict verdict={position.verdict} />{reasons.length ? <div className="mt-1 text-[10px] text-muted-foreground">{reasons.join(" · ")}</div> : null}</div>;
}

function PricePair({
  source,
  ours,
  delta,
  pnl,
  lagSeconds,
  lifecycleOffsetSeconds,
  lifecycleType
}: {
  source?: number;
  ours?: number;
  delta?: number;
  pnl?: number;
  lagSeconds?: number;
  lifecycleOffsetSeconds?: number;
  lifecycleType?: string;
}) {
  const sourceLabel = source === undefined
    ? lifecycleType && lifecycleType !== "TRADE" ? `${lifecycleType} n/a` : "n/a"
    : source.toFixed(4);
  const oursLabel = ours === undefined ? "n/a" : ours.toFixed(4);
  return (
    <div className="min-w-[150px] text-right font-mono tabular-nums">
      <div><span className={cn(source === undefined && "text-muted-foreground", source !== undefined && "text-source")}>{sourceLabel}</span><span className="px-1 text-muted-foreground">→</span><span className={cn(ours === undefined && "text-muted-foreground", ours !== undefined && "text-primary")}>{oursLabel}</span></div>
      {delta !== undefined || pnl !== undefined ? (
        <div className={cn("mt-0.5 text-[10px]", (pnl ?? 0) >= 0 ? "text-profit" : "text-loss")}>
          Δ {delta !== undefined && delta >= 0 ? "+" : ""}{delta?.toFixed(4)} · {pnl === undefined ? "n/a" : formatCurrency(pnl)}
        </div>
      ) : null}
      {lifecycleType && lifecycleType !== "TRADE"
        ? <LifecycleOffset value={lifecycleOffsetSeconds} />
        : <LagSeconds value={lagSeconds} />}
    </div>
  );
}

function LagSeconds({ value }: { value?: number }) {
  if (value === undefined || !Number.isFinite(value)) return null;
  return <div className="mt-0.5 text-[10px] text-muted-foreground">lag {value >= 0 ? "+" : ""}{value.toFixed(1)}s</div>;
}

function LifecycleOffset({ value }: { value?: number }) {
  if (value === undefined || !Number.isFinite(value)) return null;
  return <div className="mt-0.5 text-[10px] text-muted-foreground">lifecycle {value >= 0 ? "+" : ""}{value.toFixed(1)}s</div>;
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
