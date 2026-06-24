import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WalletSummary } from "@/lib/types";
import { formatCompact, formatCurrency, formatPercent, shortWallet } from "@/lib/utils";

export function WalletTable({ wallets }: { wallets: WalletSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-primary">Wallet Leaderboard</CardTitle>
        <CardDescription>
          Size-weighted attribution from analytics events and signal wallet context.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {wallets.length === 0 ? (
          <EmptyState message="No attributed wallets match the current filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left font-mono text-sm">
              <thead className="border-b border-border/80 text-xs uppercase text-caution">
                <tr>
                  <th className="py-2 font-medium">Wallet</th>
                  <th className="py-2 text-right font-medium">Net PnL</th>
                  <th className="py-2 text-right font-medium">Win Rate</th>
                  <th className="py-2 text-right font-medium">Trades</th>
                  <th className="py-2 text-right font-medium">Avg Size</th>
                  <th className="py-2 font-medium">Best Fit</th>
                  <th className="py-2 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet) => (
                  <tr key={wallet.wallet} className="border-b border-border/45 hover:bg-primary/5">
                    <td className="py-3 font-mono text-xs">
                      <span title={wallet.wallet}>{shortWallet(wallet.wallet)}</span>
                    </td>
                    <td className={wallet.netPnl >= 0 ? "py-3 text-right font-mono text-profit" : "py-3 text-right font-mono text-loss"}>
                      {formatCurrency(wallet.netPnl)}
                    </td>
                    <td className="py-3 text-right font-mono">
                      {formatPercent(wallet.winRate)}
                    </td>
                    <td className="py-3 text-right font-mono">
                      {wallet.trades}
                    </td>
                    <td className="py-3 text-right font-mono">
                      {formatCompact(wallet.averagePositionSize)}
                    </td>
                    <td className="py-3">
                      <Badge variant="secondary">{wallet.bestStrategy}</Badge>
                    </td>
                    <td className="py-3">
                      <Badge
                        variant={
                          wallet.compatibility === "candidate"
                            ? "profit"
                            : wallet.compatibility === "review"
                              ? "loss"
                              : "outline"
                        }
                      >
                        {wallet.compatibility}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-primary/35 bg-background/30 p-8 text-center font-mono text-sm text-muted-foreground">
      {message}
    </div>
  );
}
