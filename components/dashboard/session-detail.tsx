import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { ConfigSnapshot } from "@/components/dashboard/config-snapshot";
import { EvidenceTable } from "@/components/dashboard/evidence-table";
import { MarketPositions } from "@/components/dashboard/market-positions";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { PortfolioSizing } from "@/components/dashboard/portfolio-sizing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { RecentEvidence, SessionSummary } from "@/lib/types";
import { formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

export function SessionDetail({
  session,
  evidence
}: {
  session?: SessionSummary;
  evidence: RecentEvidence[];
}) {
  if (!session) return null;

  return (
    <section className="grid min-w-0 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate font-mono text-base">
                {session.label}
              </CardTitle>
              <CardDescription className="mt-1">
                {session.strategyFamily} / {session.mode}
                {session.deploymentKey ? (
                  <span className="text-muted-foreground">
                    {" "} / deployment {shortWallet(session.deploymentKey)}
                  </span>
                ) : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={session.mode === "paper" ? "secondary" : "caution"}>
                {session.mode}
              </Badge>
              <Badge variant={session.totalPnl >= 0 ? "profit" : "loss"}>
                {formatCurrency(session.totalPnl)}
              </Badge>
              {session.polymarketWalletUrl ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={session.polymarketWalletUrl} target="_blank">
                    <ExternalLink className="size-4" />
                    Wallet
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <PnlChart points={session.pnlSeries} />
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <DetailStat label="Total PnL" value={formatCurrency(session.totalPnl)} />
            <DetailStat label="Realized PnL" value={formatCurrency(session.realizedPnl)} />
            <DetailStat
              label="Unrealized PnL"
              value={
                session.unrealizedPnl === undefined
                  ? "n/a"
                  : formatCurrency(session.unrealizedPnl)
              }
            />
            <DetailStat
              label="Net after fees"
              value={formatCurrency(session.netPnlAfterFees)}
            />
            <DetailStat label="Fees" value={formatCurrency(-session.fees)} />
            <DetailStat label="Win rate" value={formatPercent(session.winRate)} />
            <DetailStat label="Trades" value={session.trades.toString()} />
            <DetailStat
              label="Resolved markets"
              value={session.resolvedMarkets.toString()}
            />
            <DetailStat
              label="Avg resolved"
              value={formatCurrency(session.averagePnlPerResolvedMarket)}
            />
            <DetailStat
              label="Avg trade size"
              value={formatCurrency(session.averageTradeSize)}
            />
            <DetailStat label="Total volume" value={formatCurrency(session.totalVolume)} />
            <DetailStat label="Fill rate" value={formatPercent(session.fillRate)} />
            <DetailStat
              label="Fill failure"
              value={formatPercent(session.fillFailureRate)}
            />
            <DetailStat
              label="Failed orders"
              value={formatPercent(session.failedOrderRate)}
            />
            <DetailStat
              label="Active deployments"
              value={session.activeDeployments.toString()}
            />
            <DetailStat
              label="Active containers"
              value={session.activeContainers.toString()}
            />
            <DetailStat
              label="Skipped"
              value={session.skippedOpportunityCount.toString()}
            />
            <DetailStat label="Best trade" value={formatCurrency(session.bestTrade)} />
            <DetailStat label="Worst trade" value={formatCurrency(session.worstTrade)} />
            <DetailStat label="Max drawdown" value={formatCurrency(-session.maxDrawdown)} />
          </div>
          <MetricSection
            title="Execution"
            metrics={[
              ["Fill rate", formatPercent(session.fillRate)],
              ["Failed order rate", formatPercent(session.failedOrderRate)],
              ["Fill failure rate", formatPercent(session.fillFailureRate)],
              ["Skipped opportunities", session.skippedOpportunityCount.toString()],
              ["Average fee/fill", formatCurrency(session.averageFeePerFill)],
              [
                "Average slippage",
                session.averageSlippage === undefined
                  ? "n/a"
                  : `$${session.averageSlippage.toFixed(4)}`
              ],
              [
                "Signal to order",
                session.averageSignalToOrderSeconds === undefined
                  ? "n/a"
                  : formatDuration(session.averageSignalToOrderSeconds)
              ],
              [
                "Order to resolution",
                session.averageOrderToResolutionSeconds === undefined
                  ? "n/a"
                  : formatDuration(session.averageOrderToResolutionSeconds)
              ],
              ["Partial fill rate", formatPercent(session.partialFillRate)],
              ["Cancel rate", formatPercent(session.cancelRate)],
              ["Rejected orders", session.rejectedOrderCount.toString()],
              ["Cash drag", formatCurrency(session.cashDrag)],
              ["Unused allocation", formatCurrency(session.unusedAllocation)],
              ["Max deployed", formatCurrency(session.maxCapitalDeployed)]
            ]}
          />
          <MetricSection
            title="Risk"
            metrics={[
              ["Max drawdown", formatCurrency(-session.maxDrawdown)],
              ["Worst trade", formatCurrency(session.worstTrade)],
              ["Profit factor", session.profitFactor.toFixed(2)],
              ["Sharpe ratio", session.sharpeRatio.toFixed(2)],
              ["Expectancy/trade", formatCurrency(session.expectancyPerTrade)],
              ["Average win", formatCurrency(session.averageWin)],
              ["Average loss", formatCurrency(session.averageLoss)],
              ["Win/loss ratio", session.winLossRatio.toFixed(2)],
              ["Max intraday drawdown", formatCurrency(-session.maxIntradayDrawdown)],
              ["PnL volatility", formatCurrency(session.pnlVolatility)],
              ["Downside deviation", formatCurrency(session.downsideDeviation)],
              ["Worst market", session.worstMarket ?? "n/a"],
              ["Worst market PnL", formatCurrency(session.worstMarketPnl)],
              ["Worst 5m window", formatCurrency(session.worstFiveMinuteWindow)],
              ["Worst 15m window", formatCurrency(session.worstFifteenMinuteWindow)],
              ["Worst 1h window", formatCurrency(session.worstOneHourWindow)],
              ["Consecutive wins", session.consecutiveWins.toString()],
              ["Consecutive losses", session.consecutiveLosses.toString()]
            ]}
          />
          <BreakdownSection
            title="Strategy breakdowns"
            groups={[
              ["Exposure", session.exposureByAsset],
              ["Wallet", session.pnlByWallet],
              ["Config", session.pnlByConfig],
              ["Allocation", session.pnlByAllocationMode],
              ["Market type", session.pnlByMarketType],
              ["Asset", session.pnlByAsset],
              ["Time of day", session.pnlByTimeOfDay],
              ["Liquidity", session.pnlByLiquidityBucket],
              ["Source size", session.pnlBySourcePositionSize],
              ["Signal strength", session.pnlBySignalStrength],
              ["Confidence", session.pnlByConfidenceScore]
            ]}
          />
          <MetricSection
            title="Data quality"
            metrics={[
              ["Missing resolutions", session.dataQuality.missingMarketResolutions.toString()],
              ["No session ID", session.dataQuality.eventsWithoutSessionId.toString()],
              ["No source wallet", session.dataQuality.eventsWithoutSourceWallet.toString()],
              ["No config snapshot", session.dataQuality.eventsWithoutConfigSnapshot.toString()],
              ["Duplicate order IDs", session.dataQuality.duplicateOrderIds.toString()],
              ["Duplicate rows", session.dataQuality.duplicateEventRows.toString()],
              ["Null cash delta", session.dataQuality.nullNetCashDelta.toString()],
              ["Title conflicts", session.dataQuality.inconsistentMarketTitles.toString()],
              ["Stale container", session.dataQuality.staleContainers.toString()],
              ["Unknown deployments", session.dataQuality.eventsFromUnknownDeployments.toString()]
            ]}
          />
          <PortfolioSizing sizing={session.sizing} />
          <ConfigSnapshot config={session.configSnapshot} />
        </CardContent>
      </Card>

      <MarketPositions positions={session.marketPositions} />
      <EvidenceTable evidence={evidence} />
    </section>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function MetricSection({
  title,
  metrics
}: {
  title: string;
  metrics: Array<[string, string]>;
}) {
  return (
    <section className="rounded-md border border-border bg-muted/20 p-3">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <DetailStat key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function BreakdownSection({
  title,
  groups
}: {
  title: string;
  groups: Array<[string, Array<{ label: string; value: number; count: number }>]>;
}) {
  return (
    <section className="rounded-md border border-border bg-muted/20 p-3">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map(([label, rows]) => (
          <div key={label} className="rounded-md border border-border bg-background/60 p-3">
            <div className="mb-2 text-xs text-muted-foreground">{label}</div>
            {rows.length === 0 ? (
              <div className="text-xs text-muted-foreground">n/a</div>
            ) : (
              <div className="grid gap-1">
                {rows.slice(0, 5).map((row) => (
                  <div
                    key={`${label}-${row.label}`}
                    className="grid grid-cols-[minmax(0,1fr)_90px_42px] gap-2 text-xs"
                  >
                    <span className="truncate">{row.label}</span>
                    <span
                      className={
                        row.value >= 0
                          ? "text-right font-mono text-profit"
                          : "text-right font-mono text-loss"
                      }
                    >
                      {formatCurrency(row.value)}
                    </span>
                    <span className="text-right font-mono text-muted-foreground">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "n/a";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
