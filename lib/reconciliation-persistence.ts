import "server-only";

import { getPrisma } from "@/lib/prisma";
import type { SessionComparison } from "@/lib/types";

export async function persistReconciliation(
  comparison: SessionComparison
) {
  const prisma = getPrisma();

  const row = await prisma.sessionReconciliation.create({
    data: {
      sessionId: comparison.sessionId,
      sourceWallet: comparison.sourceWallet,
      sourceScope: comparison.sourceScope,
      unit: comparison.unit,
      ourPnl: comparison.summary.ourPnl,
      sourcePnl: comparison.summary.sourcePnl,
      pnlGap: comparison.summary.pnlGap,
      ourReturnPct: comparison.summary.ourReturnPct,
      sourceReturnPct: comparison.summary.sourceReturnPct,
      pnlGapPct: comparison.summary.pnlGapPct,
      factorsJson: JSON.stringify(comparison.summary.factors),
      seriesJson: JSON.stringify({ series: comparison.series, realizedSeries: comparison.realizedSeries }),
      positions: {
        createMany: {
          data: comparison.positions.map((pos) => ({
            key: pos.key,
            conditionId: pos.conditionId,
            market: pos.market,
            outcome: pos.outcome ?? null,
            asset: pos.asset ?? null,
            targetShares: pos.targetShares ?? null,
            targetDollars: pos.targetDollars ?? null,
            executedShares: pos.filledShares,
            fillPercent: pos.fillPercent ?? null,
            ourTargetPct: pos.ourTargetPct ?? null,
            entryLagMs: pos.entryLagMs ?? null,
            exitLagMs: pos.exitLagMs ?? null,
            realizedPnl: pos.ourPnl,
            ourReturnPct: pos.ourReturnPct ?? null,
            sourceCashPnl: pos.sourceCashPnl ?? null,
            sourceRealizedPnl: pos.sourceRealizedPnl ?? null,
            sourceReturnPct: pos.sourceReturnPct ?? null,
            pnlGapPct: pos.pnlGapPct ?? null,
            sourceWallet: comparison.sourceWallet,
            sourceSeenAt: pos.sourceSeenAt ?? null,
            sourcePositionSize: null,
            sourcePositionValue: pos.sourcePositionValue ?? null,
            sourceAvgPrice: pos.sourceAvgPrice ?? null,
            ourHeldBefore: pos.ourHeldBefore ?? null,
            ourHeldAfter: pos.ourHeldAfter ?? null,
            ourFillPrice: pos.ourFillPrice ?? null,
            ourFillTime: pos.ourFillTime ? new Date(pos.ourFillTime) : null,
            sizingErrorPct: pos.sizingErrorPct ?? null,
            sourceEntryPrice: pos.sourceEntryPrice ?? null,
            ourEntryPrice: pos.ourEntryPrice ?? null,
            sourceExitPrice: pos.sourceExitPrice ?? null,
            ourExitPrice: pos.ourExitPrice ?? null,
            ourCurrentShares: pos.ourCurrentShares,
            sourceCurrentShares: pos.sourceCurrentShares,
            verdict: pos.verdict,
            notes: pos.notes.length > 0 ? pos.notes.join("\n") : null
          }))
        }
      }
    }
  });

  return row.id;
}
