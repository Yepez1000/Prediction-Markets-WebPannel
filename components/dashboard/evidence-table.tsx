"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { RecentEvidence } from "@/lib/types";
import { formatCurrency, shortWallet } from "@/lib/utils";

export function EvidenceTable({ evidence }: { evidence: RecentEvidence[] }) {
  const [visibleCount, setVisibleCount] = useState(40);
  const visibleEvidence = evidence.slice(0, visibleCount);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Placed trades</CardTitle>
        <CardDescription>Most recent trades first.</CardDescription>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No placed trades were recorded for this session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Time</th>
                  <th className="py-2 font-medium">Mode</th>
                  <th className="py-2 font-medium">Action</th>
                  <th className="py-2 font-medium">Market</th>
                  <th className="py-2 font-medium">Wallet</th>
                  <th className="py-2 text-right font-medium">PnL</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvidence.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 align-top">
                    <td className="py-2 font-mono text-xs text-muted-foreground">
                      {new Date(row.when).toLocaleString()}
                    </td>
                    <td className="py-2">
                      <Badge variant={row.mode === "paper" ? "secondary" : "caution"}>
                        {row.mode}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="text-xs">{row.action}</div>
                      <div className="text-xs text-muted-foreground">{row.status}</div>
                    </td>
                    <td className="max-w-[360px] py-2 text-xs text-muted-foreground">
                      <span className="line-clamp-2">{row.market}</span>
                    </td>
                    <td className="py-2 font-mono text-xs" title={row.wallet}>
                      {shortWallet(row.wallet)}
                    </td>
                    <td
                      className={
                        row.netPnl >= 0
                          ? "py-2 text-right font-mono text-profit"
                          : "py-2 text-right font-mono text-loss"
                      }
                    >
                      {formatCurrency(row.netPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleCount < evidence.length ? <div className="pt-4 text-center"><Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + 40)}>Show 40 more</Button></div> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
