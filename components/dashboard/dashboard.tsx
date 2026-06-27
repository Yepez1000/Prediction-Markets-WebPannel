import { Database, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DeploymentGrid } from "@/components/dashboard/deployment-grid";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { SessionDetail } from "@/components/dashboard/session-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardData, DashboardFilters } from "@/lib/types";

export function Dashboard({
  data,
  filters,
  comparison
}: {
  data: DashboardData;
  filters: DashboardFilters;
  comparison?: ReactNode;
}) {
  const selectedSession =
    filters.session && filters.session !== "all"
      ? data.sessions.find((session) => session.sessionId === filters.session)
      : undefined;

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Database className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">
                {data.appName}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Deployment/session performance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={data.isConfigured ? "profit" : "caution"}>
              {data.isConfigured ? "Connected" : "Env needed"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <RefreshCw className="size-4" />
                Refresh
              </Link>
            </Button>
          </div>
        </div>
        <FilterBar filters={filters} data={data} />
      </header>

      <div className="mx-auto grid min-w-0 max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:px-6">
        {data.error ? (
          <div className="rounded-md border border-caution/30 bg-caution/10 p-3 text-sm text-caution">
            {data.error}
          </div>
        ) : null}
        {data.warnings.map((warning) => (
          <div
            key={warning}
            className="rounded-md border border-caution/30 bg-caution/10 p-3 text-sm text-caution"
          >
            {warning}
          </div>
        ))}
        <DeploymentGrid
          deployments={data.deployments}
          sessions={data.sessions}
          filters={filters}
        />
        <SessionDetail session={selectedSession} evidence={data.evidence} />
        {comparison}
        <footer className="pb-4 text-xs text-muted-foreground">
          Last read {new Date(data.updatedAt).toLocaleString()}. Read-only.
        </footer>
      </div>
    </main>
  );
}
