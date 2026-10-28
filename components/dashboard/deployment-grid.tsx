import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { PnlChart } from "@/components/dashboard/pnl-chart";
import { SessionLeaderboard } from "@/components/dashboard/session-leaderboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardFilters, DeploymentSummary, SessionSummary } from "@/lib/types";
import { formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

function href(filters: DashboardFilters, deployment?: string) {
  const params = new URLSearchParams({ view: "deployments" });
  if (filters.mode) params.set("mode", filters.mode);
  if (deployment) params.set("deployment", deployment);
  return `/?${params.toString()}`;
}

export function DeploymentGrid({ deployments, sessions, filters }: { deployments: DeploymentSummary[]; sessions: SessionSummary[]; filters: DashboardFilters }) {
  const selected = filters.deployment && filters.deployment !== "all"
    ? deployments.find((deployment) => deployment.id === filters.deployment || deployment.deploymentKey === filters.deployment)
    : undefined;

  if (selected) return <DeploymentDetail deployment={selected} sessions={sessions} filters={filters} />;
  const newestFirst = [...deployments].sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Deployments</h2>
        <p className="mt-1 text-sm text-muted-foreground">Active and historical strategy runs.</p>
      </div>
      {deployments.length === 0 ? <EmptyState message="No deployments match the current filters." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {newestFirst.map((deployment) => <DeploymentCard key={deployment.id} deployment={deployment} filters={filters} />)}
        </div>
      )}
    </section>
  );
}

function DeploymentCard({ deployment, filters }: { deployment: DeploymentSummary; filters: DashboardFilters }) {
  const deploymentRef = deployment.deploymentKey ?? deployment.deploymentId ?? deployment.id;
  return (
    <Link href={href(filters, deploymentRef)} className="group">
      <Card className="h-full rounded-2xl transition-colors hover:border-primary/60 hover:bg-[#333333]">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><CardTitle className="truncate text-base">{deployment.label}</CardTitle><CardDescription className="mt-2 truncate">{deployment.strategyFamily} · {deployment.allocationMode || "standard"}</CardDescription></div>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[#a5b4fc]" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between border-t border-border pt-4">
            <div><p className="text-xs text-muted-foreground">Net PnL</p><p className={deployment.netPnl >= 0 ? "mt-1 font-mono text-xl font-semibold text-profit" : "mt-1 font-mono text-xl font-semibold text-loss"}>{formatCurrency(deployment.netPnl)}</p></div>
            <Badge variant={deployment.status === "active" ? "profit" : "secondary"}>{deployment.status}</Badge>
          </div>
          <div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>{deployment.trades} trades</span><span>{formatPercent(deployment.winRate)} win rate</span></div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DeploymentDetail({ deployment, sessions, filters }: { deployment: DeploymentSummary; sessions: SessionSummary[]; filters: DashboardFilters }) {
  const deploymentRef = deployment.deploymentKey ?? deployment.deploymentId ?? deployment.id;
  const attachedSessions = sessions.filter((session) => session.deploymentKey === deploymentRef || session.deploymentId === deploymentRef);
  return (
    <section className="grid gap-5">
      <div className="flex items-center justify-between gap-3"><div><Button asChild variant="ghost" size="sm"><Link href={href(filters)}><ArrowLeft className="size-3.5" /> All deployments</Link></Button><h2 className="mt-3 text-xl font-semibold">{deployment.label}</h2><p className="mt-1 text-sm text-muted-foreground">{deployment.strategyFamily} · {shortWallet(deploymentRef)}</p></div><Badge variant={deployment.status === "active" ? "profit" : "secondary"}>{deployment.status}</Badge></div>
      <Card className="rounded-2xl"><CardContent className="grid gap-5 p-5"><PnlChart points={deployment.pnlSeries} /><PrimaryMetrics item={deployment} /></CardContent></Card>
      <SessionLeaderboard
        sessions={attachedSessions}
        filters={filters}
        heading="Attached wallets"
        description="Sessions attached to this deployment, ranked by net profit and loss."
      />
    </section>
  );
}

export function PrimaryMetrics({ item }: { item: DeploymentSummary }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="PnL" value={formatCurrency(item.netPnl)} positive={item.netPnl >= 0} /><Metric label="Win rate" value={formatPercent(item.winRate)} /><Metric label="Sharpe" value={item.sharpeRatio.toFixed(2)} /><Metric label="Trades" value={item.trades.toString()} /></div>;
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) { return <div className="rounded-xl border border-border bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={positive === undefined ? "mt-1 font-mono text-lg font-semibold" : positive ? "mt-1 font-mono text-lg font-semibold text-profit" : "mt-1 font-mono text-lg font-semibold text-loss"}>{value}</p></div>; }
function EmptyState({ message }: { message: string }) { return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{message}</div>; }
