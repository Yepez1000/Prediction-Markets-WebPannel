import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Box,
  ChevronsUpDown,
  GitBranch,
  PlayCircle
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type {
  DashboardFilters,
  DeploymentSummary,
  DeploymentWalletPerformance,
  Pagination,
  SessionSummary
} from "@/lib/types";
import { formatCurrency, formatPercent, shortWallet } from "@/lib/utils";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import type { PnlPoint } from "@/lib/types";

function detailHref(filters: DashboardFilters, next: Partial<DashboardFilters>) {
  const params = new URLSearchParams();
  const merged = { ...filters, ...next };
  for (const [key, value] of Object.entries(merged)) {
    if (!value || value === "all") continue;
    params.set(key, value);
  }
  return `/?${params.toString()}`;
}

export function DeploymentGrid({
  deployments,
  deploymentPagination,
  deploymentWallets,
  sessions,
  filters
}: {
  deployments: DeploymentSummary[];
  deploymentPagination: Pagination;
  deploymentWallets: DeploymentWalletPerformance[];
  sessions: SessionSummary[];
  filters: DashboardFilters;
}) {
  const selectedDeployment =
    filters.deployment && filters.deployment !== "all"
      ? deployments.find((deployment) => deployment.id === filters.deployment)
      : undefined;
  const deploymentRef = selectedDeployment?.deploymentKey ?? selectedDeployment?.deploymentId ?? selectedDeployment?.id;
  const selectedSessions = deploymentRef
    ? sessions.filter((session) => session.deploymentKey === deploymentRef || session.deploymentId === deploymentRef)
    : [];
  const selectedSessionActive = Boolean(filters.session && filters.session !== "all");

  return (
    <div className="grid min-w-0 gap-4">
      {selectedDeployment && !selectedSessionActive ? (
        <DeploymentDetail
          deployment={selectedDeployment}
          sessions={selectedSessions}
          wallets={deploymentWallets}
          filters={filters}
        />
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Deployments</CardTitle>
              <CardDescription>Docker groups keyed by deployment_key.</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <DeploymentSortHeader label="Started" value="date" filters={filters} />
              <DeploymentSortHeader label="PnL" value="pnl" filters={filters} />
              {selectedDeployment ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={detailHref(filters, { deployment: "all", session: "all", wallet: undefined })}>
                    <ArrowLeft className="size-4" />
                    All
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {deployments.length === 0 ? (
            <EmptyState message="No Docker deployments match the current filters." />
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_150px_80px_120px_110px_86px] items-center border-b border-border bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span>Deployment</span>
                <span>Started</span>
                <span className="text-right">Trades</span>
                <span className="text-right">PnL</span>
                <span>Win rate</span>
                <span>Mode</span>
              </div>
              <div className="divide-y divide-border">
                {deployments.map((deployment) => (
                  <DeploymentRow
                    key={deployment.id}
                    deployment={deployment}
                    href={detailHref(filters, {
                      deployment: deployment.deploymentKey ?? deployment.id,
                      mode: deployment.mode,
                      session: "all"
                    })}
                  />
                ))}
              </div>
            </div>
          )}
          <DeploymentPagination pagination={deploymentPagination} filters={filters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            {selectedDeployment
              ? `Attached to ${selectedDeployment.label}.`
                : "Recent standalone sessions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState message="No sessions match the current filters." />
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_150px_120px_100px_90px_90px_86px] items-center border-b border-border bg-muted/20 px-3 py-1 md:grid">
                <SortHeader label="Session" value="name" filters={filters} />
                <SortHeader label="Started" value="date" filters={filters} />
                <SortHeader label="PnL" value="pnl" filters={filters} align="right" />
                <SortHeader label="Win rate" value="winRate" filters={filters} align="right" />
                <SortHeader label="Trades" value="trades" filters={filters} align="right" />
                <span className="px-2 text-right text-xs font-medium text-muted-foreground">Sharpe</span>
                <span className="px-2 text-xs font-medium text-muted-foreground">Mode</span>
              </div>
              <div className="divide-y divide-border">
                {sessions.map((session) => (
                  <SessionRow
                    key={session.sessionId}
                    session={session}
                    href={detailHref(filters, {
                      deployment: session.deploymentKey,
                      session: session.sessionId,
                      mode: session.mode,
                      wallet: undefined
                    })}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeploymentPagination({
  pagination,
  filters
}: {
  pagination: Pagination;
  filters: DashboardFilters;
}) {
  if (pagination.total === 0) return null;
  const first = (pagination.page - 1) * pagination.limit + 1;
  const last = Math.min(pagination.page * pagination.limit, pagination.total);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="font-mono tabular-nums">
        {first}-{last} of {pagination.total} deployments
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {[20, 50, 100].map((limit) => (
          <Button key={limit} asChild variant={pagination.limit === limit ? "default" : "outline"} size="sm">
            <Link href={detailHref(filters, { deploymentLimit: String(limit), deploymentPage: "1" })}>
              {limit}
            </Link>
          </Button>
        ))}
        <Button asChild variant="outline" size="sm" disabled={pagination.page === 1}>
          <Link href={detailHref(filters, { deploymentPage: String(Math.max(1, pagination.page - 1)) })}>
            Previous
          </Link>
        </Button>
        <span className="px-1 font-mono tabular-nums">
          {pagination.page}/{pagination.totalPages}
        </span>
        <Button asChild variant="outline" size="sm" disabled={pagination.page === pagination.totalPages}>
          <Link href={detailHref(filters, { deploymentPage: String(Math.min(pagination.totalPages, pagination.page + 1)) })}>
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}

function DeploymentDetail({
  deployment,
  sessions,
  wallets,
  filters
}: {
  deployment: DeploymentSummary;
  sessions: SessionSummary[];
  wallets: DeploymentWalletPerformance[];
  filters: DashboardFilters;
}) {
  const pnlSeries = combineSessionSeries(sessions);
  const chartStats = summarizeSeries(pnlSeries, sessions.flatMap((session) => session.pnlSeries.map((point) => point.delta)));
  const stats: Array<[string, string]> = [
    ["Total PnL", formatCurrency(deployment.totalPnl)],
    ["Realized PnL", formatCurrency(deployment.realizedPnl)],
    ["Unrealized PnL", deployment.unrealizedPnl === undefined ? "n/a" : formatCurrency(deployment.unrealizedPnl)],
    ["Net after fees", formatCurrency(deployment.netPnlAfterFees)],
    ["Fees", formatCurrency(-deployment.fees)],
    ["Win rate", formatPercent(deployment.winRate)],
    ["Trades", (chartStats.tradeCount || deployment.trades).toString()],
    ["Markets", deployment.markets.toString()],
    ["Resolved markets", deployment.resolvedMarkets.toString()],
    ["Session count", deployment.sessionCount.toString()],
    ["Active containers", deployment.activeContainers.toString()],
    ["Avg trade size", formatCurrency(deployment.averageTradeSize)],
    ["Total volume", formatCurrency(deployment.totalVolume)],
    ["Profit factor", chartStats.profitFactor.toFixed(2)],
    ["Max drawdown", formatCurrency(-chartStats.maxDrawdown)],
    ["Average slippage", deployment.averageSlippage === undefined ? "n/a" : `$${deployment.averageSlippage.toFixed(4)}`],
    ["Signal to order", deployment.averageSignalToOrderSeconds === undefined ? "n/a" : formatDuration(deployment.averageSignalToOrderSeconds)],
    ["Order to resolution", deployment.averageOrderToResolutionSeconds === undefined ? "n/a" : formatDuration(deployment.averageOrderToResolutionSeconds)],
    ["Sharpe ratio", chartStats.sharpeRatio.toFixed(2)],
    ["Best trade", formatCurrency(chartStats.bestTrade)],
    ["Worst trade", formatCurrency(chartStats.worstTrade)],
    ["Last trade", deployment.lastTradeAt ? new Date(deployment.lastTradeAt).toLocaleString() : "n/a"]
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-mono text-base">{deployment.label}</CardTitle>
            <CardDescription className="mt-1">
              Deployment {shortWallet(deployment.deploymentKey ?? deployment.deploymentId ?? deployment.id)} · {deployment.strategyFamily} / {deployment.mode}
              {deployment.containerId ? <span className="text-muted-foreground"> · container {shortWallet(deployment.containerId)}</span> : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/30 px-2 py-1">{sessions.length} sessions visible</span>
            <span className="rounded-full border border-border bg-muted/30 px-2 py-1">{deployment.status}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PnlChart points={pnlSeries.length > 0 ? pnlSeries : deployment.pnlSeries} />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(([label, value]) => (
            <DetailStat key={label} label={label} value={value} />
          ))}
        </div>
        <DeploymentWalletTable wallets={wallets} filters={filters} />
      </CardContent>
    </Card>
  );
}

function DeploymentWalletTable({
  wallets,
  filters
}: {
  wallets: DeploymentWalletPerformance[];
  filters: DashboardFilters;
}) {
  return (
    <section className="rounded-md border border-border">
      <div className="border-b border-border bg-muted/20 px-3 py-2">
        <h2 className="text-sm font-semibold">Wallet performance</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Combined across this deployment&apos;s sessions by source wallet.
        </p>
      </div>
      {wallets.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">
          No source-wallet sessions match this deployment.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Source wallet</th>
                <th className="px-3 py-2 text-right font-medium">Sessions</th>
                <th className="px-3 py-2 text-right font-medium">PnL</th>
                <th className="px-3 py-2 text-right font-medium">Win rate</th>
                <th className="px-3 py-2 text-right font-medium">Sharpe</th>
                <th className="px-3 py-2 text-right font-medium">Trades</th>
                <th className="px-3 py-2 text-right font-medium">Markets</th>
                <th className="px-3 py-2 text-right font-medium">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {wallets.map((wallet) => (
                <tr key={wallet.wallet} className="bg-card hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs text-primary">
                    <Link href={detailHref(filters, { wallet: wallet.wallet, session: "all" })}>
                      {wallet.wallet}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {wallet.sessionCount}
                  </td>
                  <td className={wallet.totalPnl >= 0 ? "px-3 py-2 text-right font-mono tabular-nums text-profit" : "px-3 py-2 text-right font-mono tabular-nums text-loss"}>
                    {formatCurrency(wallet.totalPnl)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatPercent(wallet.winRate)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {wallet.sharpeRatio.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {wallet.trades}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {wallet.markets}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatCurrency(wallet.totalVolume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "n/a";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function combineSessionSeries(sessions: SessionSummary[]): PnlPoint[] {
  const deltas = new Map<string, number>();
  for (const session of sessions) {
    for (const point of session.pnlSeries) {
      deltas.set(point.when, (deltas.get(point.when) ?? 0) + point.delta);
    }
  }
  let value = 0;
  return Array.from(deltas.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([when, delta]) => {
      value += delta;
      return { when, value, delta };
    });
}

function summarizeSeries(points: PnlPoint[], deltas: number[]) {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    maxDrawdown = Math.max(maxDrawdown, peak - point.value);
  }
  const positive = deltas.filter((value) => value > 0);
  const negative = deltas.filter((value) => value < 0);
  const grossPositive = positive.reduce((sum, value) => sum + value, 0);
  const grossNegative = negative.reduce((sum, value) => sum + Math.abs(value), 0);
  return {
    tradeCount: deltas.length,
    bestTrade: deltas.length > 0 ? Math.max(...deltas) : 0,
    worstTrade: deltas.length > 0 ? Math.min(...deltas) : 0,
    maxDrawdown,
    profitFactor: grossNegative === 0 ? grossPositive : grossPositive / grossNegative,
    sharpeRatio: sharpeRatio(deltas)
  };
}

function sharpeRatio(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  return stdev === 0 ? 0 : (mean / stdev) * Math.sqrt(values.length);
}

function DeploymentRow({
  deployment,
  href
}: {
  deployment: DeploymentSummary;
  href: string;
}) {
  return (
    <div className="bg-card px-3 py-2 hover:bg-muted/30">
      <Link href={href} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_80px_120px_110px_86px] md:items-center">
        <RunName
          icon={<Box className="size-4 text-primary" />}
          title={deployment.label}
          subtitle={`${deployment.strategyFamily} / ${shortWallet(deployment.deploymentKey ?? deployment.id)}`}
        />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(deployment.startedAt).toLocaleString()}
        </span>
        <span className="text-right font-mono text-sm tabular-nums">
          {deployment.trades}
        </span>
        <PnlValue value={deployment.netPnl} />
        <span className="font-mono text-sm tabular-nums">
          {formatPercent(deployment.winRate)}
        </span>
        <Badge variant={deployment.mode === "paper" ? "secondary" : "caution"}>
          {deployment.mode}
        </Badge>
      </Link>
    </div>
  );
}

function DeploymentSortHeader({
  label,
  value,
  filters
}: {
  label: string;
  value: NonNullable<DashboardFilters["deploymentSort"]>;
  filters: DashboardFilters;
}) {
  const active = (filters.deploymentSort ?? "date") === value;
  const currentDirection = filters.deploymentDirection ?? "desc";
  const nextDirection = active && currentDirection === "desc" ? "asc" : "desc";
  const Icon = active
    ? currentDirection === "desc"
      ? ArrowDown
      : ArrowUp
    : ChevronsUpDown;

  return (
    <Button asChild variant="ghost" size="sm">
      <Link
        href={detailHref(filters, {
          deploymentSort: value,
          deploymentDirection: nextDirection
        })}
        aria-label={`Sort deployments by ${label} ${nextDirection === "desc" ? "descending" : "ascending"}`}
      >
        {label}
        <Icon className={active ? "size-3 text-primary" : "size-3 opacity-50"} />
      </Link>
    </Button>
  );
}

function SessionRow({
  session,
  href
}: {
  session: SessionSummary;
  href: string;
}) {
  return (
    <div className="bg-card px-3 py-2 hover:bg-muted/30">
      <Link href={href} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_120px_100px_90px_90px_86px] md:items-center">
        <RunName
          icon={<PlayCircle className="size-4 text-primary" />}
          title={session.label}
          subtitle={`${session.strategyFamily}${session.deploymentKey ? ` / ${shortWallet(session.deploymentKey)}` : " / standalone"}`}
        />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(session.startedAt).toLocaleString()}
        </span>
        <PnlValue value={session.netPnl} />
        <span className="text-right font-mono text-sm tabular-nums">
          {formatPercent(session.winRate)}
        </span>
        <span className="text-right font-mono text-sm tabular-nums">
          {session.trades}
        </span>
        <span className="text-right font-mono text-sm tabular-nums">
          {session.sharpeRatio.toFixed(2)}
        </span>
        <Badge variant={session.mode === "paper" ? "secondary" : "caution"}>
          {session.mode}
        </Badge>
      </Link>
    </div>
  );
}

function SortHeader({
  label,
  value,
  filters,
  align = "left"
}: {
  label: string;
  value: NonNullable<DashboardFilters["sessionSort"]>;
  filters: DashboardFilters;
  align?: "left" | "right";
}) {
  const active = (filters.sessionSort ?? "date") === value;
  const currentDirection = filters.sessionDirection ?? "desc";
  const nextDirection = active && currentDirection === "desc" ? "asc" : "desc";
  const Icon = active
    ? currentDirection === "desc"
      ? ArrowDown
      : ArrowUp
    : ChevronsUpDown;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={align === "right" ? "justify-end px-2" : "justify-start px-2"}
    >
      <Link
        href={detailHref(filters, {
          sessionSort: value,
          sessionDirection: nextDirection
        })}
        aria-label={`Sort sessions by ${label} ${nextDirection === "desc" ? "descending" : "ascending"}`}
      >
        {label}
        <Icon className={active ? "size-3 text-primary" : "size-3 opacity-50"} />
      </Link>
    </Button>
  );
}

function RunName({
  icon,
  title,
  subtitle
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">{subtitle}</span>
        </div>
      </div>
    </div>
  );
}

function PnlValue({ value }: { value: number }) {
  return (
    <span
      className={
        value >= 0
          ? "text-right font-mono text-sm tabular-nums text-profit"
          : "text-right font-mono text-sm tabular-nums text-loss"
      }
    >
      {formatCurrency(value)}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
