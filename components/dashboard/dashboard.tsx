import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import Link from "next/link";

import { EvidenceTable } from "@/components/dashboard/evidence-table";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { StrategyTable } from "@/components/dashboard/strategy-table";
import { WalletTable } from "@/components/dashboard/wallet-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardData, DashboardFilters } from "@/lib/types";

export function Dashboard({
  data,
  filters
}: {
  data: DashboardData;
  filters: DashboardFilters;
}) {
  return (
    <main className="min-h-screen">
      <header className="border-b border-border/80 bg-background/85">
        <div className="border-b border-border/60 bg-muted/35 px-4 py-1.5 font-mono text-xs text-muted-foreground md:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <span className="text-primary"> Analytics</span>
            <span className="hidden text-caution sm:inline">
              WALLET EDGE // STRATEGY COMPARE // READ ONLY
            </span>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Database className="size-5 text-primary" />
                <h1 className="font-mono text-xl font-semibold tracking-normal text-primary">
                  {data.appName}
                </h1>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Read-only wallet, strategy, and paper trading attribution over the
                PM-Model database.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={data.isConfigured ? "profit" : "caution"}>
                {data.isConfigured ? "Neon connected" : "env needed"}
              </Badge>
              <Button asChild variant="outline" size="sm">
                <Link href="/">
                  <RefreshCw className="size-4" />
                  Refresh
                </Link>
              </Button>
            </div>
          </div>
          {data.error ? (
            <div className="terminal-panel flex items-start gap-2 rounded-md border border-caution/35 bg-caution/10 p-3 font-mono text-sm text-caution">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{data.error}</span>
            </div>
          ) : null}
        </div>
        <FilterBar filters={filters} data={data} />
      </header>

      <div className="mx-auto grid min-w-0 max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:px-6">
        <KpiStrip kpis={data.kpis} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
          <WalletTable wallets={data.wallets} />
          <StrategyTable strategies={data.strategies} />
        </div>
        <EvidenceTable evidence={data.evidence} />
        <footer className="pb-4 font-mono text-xs text-muted-foreground">
          Last read {new Date(data.updatedAt).toLocaleString()}. This panel is
          read-only and does not write trades, events, or migrations.
        </footer>
      </div>
    </main>
  );
}
