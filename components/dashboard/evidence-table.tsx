import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecentEvidence } from "@/lib/types";
import { formatCurrency, shortWallet } from "@/lib/utils";

export function EvidenceTable({ evidence }: { evidence: RecentEvidence[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-primary">Recent Evidence</CardTitle>
        <CardDescription>
          The trade records and analytics events backing the aggregate view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? (
          <div className="rounded-md border border-dashed border-primary/35 bg-background/30 p-8 text-center font-mono text-sm text-muted-foreground">
            Connect Neon or widen filters to load recent trade evidence.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left font-mono text-sm">
              <thead className="border-b border-border/80 text-xs uppercase text-caution">
                <tr>
                  <th className="py-2 font-medium">Time</th>
                  <th className="py-2 font-medium">Mode</th>
                  <th className="py-2 font-medium">Strategy</th>
                  <th className="py-2 font-medium">Wallet</th>
                  <th className="py-2 font-medium">Action</th>
                  <th className="py-2 font-medium">Market</th>
                  <th className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((row) => (
                  <tr key={row.id} className="border-b border-border/45 align-top hover:bg-primary/5">
                    <td className="py-3 font-mono text-xs text-muted-foreground">
                      {new Date(row.when).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <Badge variant={row.mode === "paper" ? "secondary" : "caution"}>
                        {row.mode}
                      </Badge>
                    </td>
                    <td className="py-3 text-xs">{row.strategy}</td>
                    <td className="py-3 font-mono text-xs" title={row.wallet}>
                      {shortWallet(row.wallet)}
                    </td>
                    <td className="py-3">
                      <div className="text-xs">{row.action}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.status}
                      </div>
                    </td>
                    <td className="max-w-[360px] py-3 text-xs text-muted-foreground">
                      <span className="line-clamp-2">{row.market}</span>
                    </td>
                    <td className={row.netPnl >= 0 ? "py-3 text-right font-mono text-profit" : "py-3 text-right font-mono text-loss"}>
                      {formatCurrency(row.netPnl)}
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
