import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardFilters, SessionSummary } from "@/lib/types";
import { formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

function sessionHref(filters: DashboardFilters, session: SessionSummary) {
  const params = new URLSearchParams({ view: "sessions", session: session.sessionId, mode: session.mode });
  if (filters.view === "deployments" && filters.deployment) {
    params.set("deployment", filters.deployment);
    params.set("returnTo", "deployments");
  }
  return `/?${params.toString()}`;
}

export function SessionLeaderboard({ sessions, filters, heading = "Wallet leaderboard", description = "Sessions ranked by net profit and loss." }: { sessions: SessionSummary[]; filters: DashboardFilters; heading?: string; description?: string }) {
  const ranked = [...sessions].sort((left, right) => right.netPnl - left.netPnl);
  return (
    <section className="mb-6">
      <div className="mb-6"><h2 className="text-xl font-semibold tracking-tight">{heading}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      <Card className="rounded-2xl"><CardContent className="p-0">
        {ranked.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No sessions match the current filters.</div> : <div className="divide-y divide-border">
          <div className="hidden grid-cols-[52px_minmax(0,1fr)_120px_100px_90px_36px] gap-3 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>Rank</span><span>Wallet / session</span><span className="text-right">PnL</span><span className="text-right">Win rate</span><span className="text-right">Trades</span></div>
          {ranked.map((session, index) => <Link key={session.sessionId} href={sessionHref(filters, session)} className="grid gap-2 px-5 py-4 transition-colors hover:bg-primary/5 md:grid-cols-[52px_minmax(0,1fr)_120px_100px_90px_36px] md:items-center md:gap-3">
            <span className="font-mono text-sm text-muted-foreground">{index + 1}</span>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{session.followedWallet ? shortWallet(session.followedWallet) : session.label}</p><p className="mt-1 truncate text-xs text-muted-foreground">{session.label} · {session.strategyFamily}</p></div>
            <p className={session.netPnl >= 0 ? "font-mono text-sm font-medium text-profit md:text-right" : "font-mono text-sm font-medium text-loss md:text-right"}>{formatCurrency(session.netPnl)}</p>
            <p className="font-mono text-sm md:text-right">{formatPercent(session.winRate)}</p>
            <p className="font-mono text-sm md:text-right">{session.trades}</p>
            <ArrowUpRight className="hidden size-4 text-muted-foreground md:block" />
          </Link>)}
        </div>}
      </CardContent></Card>
    </section>
  );
}
