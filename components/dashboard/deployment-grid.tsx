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
  SessionSummary
} from "@/lib/types";
import { formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

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
  sessions,
  filters
}: {
  deployments: DeploymentSummary[];
  sessions: SessionSummary[];
  filters: DashboardFilters;
}) {
  const selectedDeployment =
    filters.deployment && filters.deployment !== "all"
      ? deployments.find((deployment) => deployment.id === filters.deployment)
      : undefined;

  return (
    <div className="grid min-w-0 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Deployments</CardTitle>
              <CardDescription>Docker groups keyed by deployment_key.</CardDescription>
            </div>
            {selectedDeployment ? (
              <Button asChild variant="outline" size="sm">
                <Link href={detailHref(filters, { deployment: "all", session: "all" })}>
                  <ArrowLeft className="size-4" />
                  All
                </Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {deployments.length === 0 ? (
            <EmptyState message="No Docker deployments match the current filters." />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {deployments.slice(0, 20).map((deployment) => (
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            {selectedDeployment
              ? `Attached to ${selectedDeployment.label}.`
              : "Recent standalone and deployment-attached sessions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState message="No sessions match the current filters." />
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_150px_120px_100px_90px_86px] items-center border-b border-border bg-muted/20 px-3 py-1 md:grid">
                <SortHeader label="Session" value="name" filters={filters} />
                <SortHeader label="Started" value="date" filters={filters} />
                <SortHeader label="PnL" value="pnl" filters={filters} align="right" />
                <SortHeader label="Win rate" value="winRate" filters={filters} align="right" />
                <SortHeader label="Trades" value="trades" filters={filters} align="right" />
                <span className="px-2 text-xs font-medium text-muted-foreground">Mode</span>
              </div>
              <div className="divide-y divide-border">
                {sessions.slice(0, 30).map((session) => (
                  <SessionRow
                    key={session.sessionId}
                    session={session}
                    href={detailHref(filters, {
                      deployment: session.deploymentKey,
                      session: session.sessionId,
                      mode: session.mode
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

function DeploymentRow({
  deployment,
  href
}: {
  deployment: DeploymentSummary;
  href: string;
}) {
  return (
    <div className="bg-card px-3 py-2 hover:bg-muted/30">
      <Link href={href} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_110px_86px] md:items-center">
        <RunName
          icon={<Box className="size-4 text-primary" />}
          title={deployment.label}
          subtitle={`${deployment.strategyFamily} / ${shortWallet(deployment.deploymentKey ?? deployment.id)}`}
        />
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

function SessionRow({
  session,
  href
}: {
  session: SessionSummary;
  href: string;
}) {
  return (
    <div className="bg-card px-3 py-2 hover:bg-muted/30">
      <Link href={href} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_120px_100px_90px_86px] md:items-center">
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
