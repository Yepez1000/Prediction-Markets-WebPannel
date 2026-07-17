import "server-only";

import { getPrisma } from "@/lib/prisma";
import type { SessionComparison } from "@/lib/types";

let persistenceUnavailable = false;
let missingTableWarningLogged = false;

function isMissingTableError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    && ["P2021", "P2022"].includes((error as { code?: string }).code ?? "");
}

function parseCachedComparison(value: string): SessionComparison | undefined {
  try {
    const payload = JSON.parse(value) as { version?: unknown; comparison?: unknown };
    const comparison = payload.version === 1 ? payload.comparison : undefined;
    if (!comparison || typeof comparison !== "object") return undefined;
    const candidate = comparison as Partial<SessionComparison>;
    if (
      typeof candidate.sessionId !== "string" ||
      typeof candidate.sourceWallet !== "string" ||
      !Array.isArray(candidate.series) ||
      !Array.isArray(candidate.realizedSeries) ||
      !Array.isArray(candidate.positions) ||
      !candidate.summary ||
      !Array.isArray(candidate.warnings)
    ) return undefined;
    return candidate as SessionComparison;
  } catch {
    return undefined;
  }
}

export async function getCachedReconciliation(input: {
  sessionId: string;
  sourceScope: SessionComparison["sourceScope"];
  unit: SessionComparison["unit"];
  maxAgeMs: number;
}) {
  if (persistenceUnavailable) return undefined;

  try {
    const row = await getPrisma().sessionReconciliation.findFirst({
      where: {
        sessionId: input.sessionId,
        sourceScope: input.sourceScope,
        unit: input.unit,
        payloadJson: { not: null },
        createdAt: { gte: new Date(Date.now() - input.maxAgeMs) }
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true }
    });
    const comparison = row?.payloadJson ? parseCachedComparison(row.payloadJson) : undefined;
    return comparison &&
      comparison.sessionId === input.sessionId &&
      comparison.sourceScope === input.sourceScope &&
      comparison.unit === input.unit
      ? comparison
      : undefined;
  } catch (error) {
    if (isMissingTableError(error)) {
      persistenceUnavailable = true;
      if (!missingTableWarningLogged) {
        missingTableWarningLogged = true;
        console.warn("Reconciliation persistence is disabled until its database migration is applied.");
      }
      return undefined;
    }
    console.error("Failed to read reconciliation cache:", error);
    return undefined;
  }
}

export async function persistReconciliation(
  comparison: SessionComparison
) {
  if (persistenceUnavailable) return undefined;
  const prisma = getPrisma();

  try {
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
      payloadJson: JSON.stringify({ version: 1, comparison }),
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
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    persistenceUnavailable = true;
    if (!missingTableWarningLogged) {
      missingTableWarningLogged = true;
      console.warn("Reconciliation persistence is disabled until its database migration is applied.");
    }
    return undefined;
  }
}
