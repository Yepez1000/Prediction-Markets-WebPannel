import { Database, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DeploymentGrid } from "@/components/dashboard/deployment-grid";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { HistoryControls } from "@/components/dashboard/history-controls";
import { SessionDetail } from "@/components/dashboard/session-detail";
import { WalletDetail } from "@/components/dashboard/wallet-detail";
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
  const selectedWallet = data.walletDetail;

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 rounded-md outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Go to dashboard home"
          >
            <Database className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">
                {data.appName}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Deployment/session performance
              </p>
            </div>
          </Link>
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
          deploymentPagination={data.deploymentPagination}
          deploymentWallets={data.deploymentWallets}
          sessions={data.sessions}
          filters={filters}
        />
        {selectedSession || selectedWallet ? (
          <SectionNav
            hasSizing={selectedSession
              ? selectedSession.sizingSnapshots.length > 0 || Boolean(selectedSession.sizing)
              : selectedWallet!.sizingSnapshots.length > 0}
            hasComparison={Boolean(comparison)}
            loadedEventCount={data.loadedSessionEventCount}
            totalEventCount={data.totalSessionEventCount}
            hasMoreEvents={data.hasMoreSessionEvents}
          />
        ) : null}
        {selectedWallet ? (
          <WalletDetail wallet={selectedWallet} />
        ) : (
          <SessionDetail
            session={selectedSession}
            evidence={data.evidence}
            loadedEventCount={data.loadedSessionEventCount}
            hasMoreEvents={data.hasMoreSessionEvents}
          />
        )}
        {comparison}
        <footer className="pb-4 text-xs text-muted-foreground">
          Last read {new Date(data.updatedAt).toLocaleString()}. Read-only.
        </footer>
      </div>
    </main>
  );
}

function SectionNav({
  hasSizing,
  hasComparison,
  loadedEventCount,
  totalEventCount,
  hasMoreEvents
}: {
  hasSizing: boolean;
  hasComparison: boolean;
  loadedEventCount?: number;
  totalEventCount?: number;
  hasMoreEvents?: boolean;
}) {
  const links = [
    ["Overview", "#session-overview"],
    ...(hasSizing ? [["Sizing", "#portfolio-sizing"]] : []),
    ["Market positions", "#market-positions"],
    ...(hasComparison ? [["Reconciliation", "#reconciliation"]] : []),
    ["Evidence", "#evidence"]
  ] as const;

  return (
    <nav className="sticky top-0 z-20 -mx-4 border-y border-border bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6" aria-label="Session sections">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex min-w-0 gap-2 overflow-x-auto">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-full border border-border bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {label}
            </Link>
          ))}
        </div>
        <HistoryControls
          loadedEventCount={loadedEventCount}
          totalEventCount={totalEventCount}
          hasMoreEvents={hasMoreEvents}
        />
      </div>
    </nav>
  );
}
