import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EvidenceTable } from "@/components/dashboard/evidence-table";
import { MarketPositions } from "@/components/dashboard/market-positions";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { SessionTabs } from "@/components/dashboard/session-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardFilters, RecentEvidence, SessionSummary } from "@/lib/types";
import { formatCompact, formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

export function SessionDetail({ session, evidence, filters, comparison }: { session?: SessionSummary; evidence: RecentEvidence[]; filters: DashboardFilters; comparison?: ReactNode }) {
  if (!session) return null;
  const returnHref = filters.returnTo === "deployments" && filters.deployment ? `/?view=deployments&deployment=${filters.deployment}` : "/?view=sessions";
  const returnLabel = filters.returnTo === "deployments" ? "Deployment" : "Wallet leaderboard";
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Button asChild variant="ghost" size="sm"><Link href={returnHref}><ArrowLeft className="size-3.5" /> {returnLabel}</Link></Button><h2 className="mt-3 text-xl font-semibold">{session.followedWallet ? shortWallet(session.followedWallet) : session.label}</h2><p className="mt-1 text-sm text-muted-foreground">{session.label} · {session.strategyFamily}</p></div><div className="flex items-center gap-2"><Badge variant={session.mode === "paper" ? "secondary" : "caution"}>{session.mode}</Badge>{session.polymarketWalletUrl ? <Button asChild variant="outline" size="sm"><Link href={session.polymarketWalletUrl} target="_blank"><ExternalLink className="size-3.5" /> Wallet</Link></Button> : null}</div></div>
      <Card className="rounded-2xl"><CardContent className="p-5"><PnlChart points={session.pnlSeries} /></CardContent></Card>
      <SessionTabs marketStatistics={<MarketStatistics session={session} />} marketPositions={<MarketPositions positions={session.marketPositions} />} activePositions={<MarketPositions positions={session.marketPositions.filter((position) => !position.resolved)} title="Active positions" description="Open market positions for this session." />} placedTrades={<EvidenceTable evidence={evidence} />} walletComparison={comparison} />
    </section>
  );
}

function MarketStatistics({ session }: { session: SessionSummary }) {
  const activePositions = session.marketPositions.filter((position) => !position.resolved).length;
  return <Card className="rounded-2xl"><CardHeader><CardTitle>Market statistics</CardTitle><CardDescription>Aggregate performance across markets in this session.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Stat label="PnL" value={formatCurrency(session.netPnl)} tone={session.netPnl >= 0 ? "profit" : "loss"} /><Stat label="Win rate" value={formatPercent(session.winRate)} /><Stat label="Sharpe" value={session.sharpeRatio.toFixed(2)} /><Stat label="Trades" value={session.trades.toString()} /><Stat label="Markets traded" value={session.markets.toString()} /><Stat label="Active positions" value={activePositions.toString()} /><Stat label="Resolved markets" value={session.resolvedMarkets.toString()} /><Stat label="Total volume" value={formatCompact(session.totalVolume)} /><Stat label="Average trade size" value={formatCurrency(session.averageTradeSize)} /><Stat label="Average resolved PnL" value={formatCurrency(session.averagePnlPerResolvedMarket)} /><Stat label="Fill rate" value={formatPercent(session.fillRate)} /><Stat label="Profit factor" value={session.profitFactor.toFixed(2)} /><Stat label="Max drawdown" value={formatCurrency(-session.maxDrawdown)} /></CardContent></Card>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={tone === "profit" ? "mt-1 font-mono text-base font-semibold text-profit" : tone === "loss" ? "mt-1 font-mono text-base font-semibold text-loss" : "mt-1 font-mono text-base font-semibold"}>{value}</p></div>; }
