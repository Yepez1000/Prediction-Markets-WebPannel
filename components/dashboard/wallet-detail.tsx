import { EvidenceTable } from "@/components/dashboard/evidence-table";
import { MarketPositions } from "@/components/dashboard/market-positions";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { PortfolioSizing } from "@/components/dashboard/portfolio-sizing";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { WalletDetail as WalletDetailData } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function WalletDetail({ wallet }: { wallet: WalletDetailData }) {
  const stats: Array<[string, string]> = [
    ["Total PnL", formatCurrency(wallet.totalPnl)],
    ["Realized PnL", formatCurrency(wallet.realizedPnl)],
    ["Fees", formatCurrency(-wallet.fees)],
    ["Win rate", formatPercent(wallet.winRate)],
    ["Sharpe ratio", wallet.sharpeRatio.toFixed(2)],
    ["Trades", wallet.trades.toString()],
    ["Markets", wallet.markets.toString()],
    ["Total volume", formatCurrency(wallet.totalVolume)],
    ["Sessions", wallet.sessionCount.toString()]
  ];

  return (
    <section className="grid min-w-0 gap-4">
      <Card id="session-overview" className="scroll-mt-16">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="break-all font-mono text-base">{wallet.wallet}</CardTitle>
              <CardDescription className="mt-1">
                Combined performance across {wallet.sessionCount} deployment session{wallet.sessionCount === 1 ? "" : "s"}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={wallet.mode === "paper" ? "secondary" : "caution"}>{wallet.mode}</Badge>
              <Badge variant={wallet.totalPnl >= 0 ? "profit" : "loss"}>{formatCurrency(wallet.totalPnl)}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <PnlChart points={wallet.pnlSeries} />
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {stats.map(([label, value]) => <DetailStat key={label} label={label} value={value} />)}
          </div>
          <PortfolioSizing snapshots={wallet.sizingSnapshots} />
        </CardContent>
      </Card>
      <MarketPositions positions={wallet.marketPositions} scopeLabel="deployment wallet" />
      <section id="evidence" className="scroll-mt-16">
        <EvidenceTable evidence={wallet.evidence} scopeLabel="deployment wallet" />
      </section>
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
