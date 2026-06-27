import { ArrowLeft, Box, GitBranch, PlayCircle } from "lucide-react";
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
            <div className="divide-y divide-border rounded-md border border-border">
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
      <Link href={href} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_110px_86px] md:items-center">
        <RunName
          icon={<PlayCircle className="size-4 text-primary" />}
          title={session.label}
          subtitle={`${session.strategyFamily}${session.deploymentKey ? ` / ${shortWallet(session.deploymentKey)}` : " / standalone"}`}
        />
        <PnlValue value={session.netPnl} />
        <span className="font-mono text-sm tabular-nums">
          {formatPercent(session.winRate)}
        </span>
        <Badge variant={session.mode === "paper" ? "secondary" : "caution"}>
          {session.mode}
        </Badge>
      </Link>
    </div>
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
          ? "font-mono text-sm tabular-nums text-profit"
          : "font-mono text-sm tabular-nums text-loss"
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
