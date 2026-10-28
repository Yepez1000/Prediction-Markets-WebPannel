import { Boxes, LayoutGrid, PanelLeftClose, PanelLeftOpen, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DeploymentGrid } from "@/components/dashboard/deployment-grid";
import { SessionDetail } from "@/components/dashboard/session-detail";
import { SessionLeaderboard } from "@/components/dashboard/session-leaderboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardData, DashboardFilters } from "@/lib/types";

const navigation = [
  { label: "Overview", view: "overview", icon: LayoutGrid },
  { label: "Deployments", view: "deployments", icon: Boxes },
  { label: "Sessions", view: "sessions", icon: Trophy }
] as const;

export function Dashboard({ data, filters, comparison }: { data: DashboardData; filters: DashboardFilters; comparison?: ReactNode }) {
  const view = filters.view ?? "overview";
  const selectedSession = filters.session && filters.session !== "all"
    ? data.sessions.find((session) => session.sessionId === filters.session)
    : undefined;

  return (
    <main className="min-h-screen md:flex">
      <input id="sidebar-toggle" type="checkbox" className="peer sr-only" aria-label="Collapse navigation" />
      <aside className="border-b border-border bg-[#202020]/95 px-4 py-5 transition-[width] duration-200 md:min-h-screen md:w-[232px] md:border-b-0 md:border-r md:px-3 md:peer-checked:w-16">
        <div className="mb-8 flex items-center justify-end px-1">
          <label htmlFor="sidebar-toggle" className="hidden cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:block">
            <PanelLeftClose className="sidebar-close size-4" />
            <PanelLeftOpen className="sidebar-open size-4" />
            <span className="sr-only">Toggle navigation</span>
          </label>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:grid">
          {navigation.map(({ label, view: itemView, icon: Icon }) => (
            <Link
              key={itemView}
              href={itemView === "overview" ? "/" : `/?view=${itemView}`}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                view === itemView ? "bg-primary/15 text-[#a5b4fc]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="sidebar-label">{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 md:px-8">
          <div>
            <h1 className="text-base font-semibold">{navigation.find((item) => item.view === view)?.label}</h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={view === "overview" ? "/" : `/?view=${view}`}>
              <RefreshCw className="size-3.5" /> Refresh
            </Link>
          </Button>
        </header>

        <div className="mx-auto min-h-[calc(100vh-73px)] max-w-7xl px-5 py-6 md:px-8">
          {data.error ? <Notice message={data.error} /> : null}
          {data.warnings.map((warning) => <Notice key={warning} message={warning} />)}
          {view === "deployments" ? <DeploymentGrid deployments={data.deployments} sessions={data.sessions} filters={filters} /> : null}
          {view === "sessions" ? <>{selectedSession ? <SessionDetail session={selectedSession} evidence={data.evidence} filters={filters} comparison={comparison} /> : <SessionLeaderboard sessions={data.sessions} filters={filters} />}</> : null}
        </div>
      </div>
    </main>
  );
}

function Notice({ message }: { message: string }) {
  return <div className="mb-4 rounded-lg border border-caution/30 bg-caution/10 px-3 py-2 text-sm text-caution">{message}</div>;
}
