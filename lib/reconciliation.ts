import "server-only";

import { getPrisma } from "@/lib/prisma";
import {
  getBatchPriceHistory,
  getClosedPositions,
  getCurrentPositions,
  getNativePnl,
  getWalletActivity,
  type PolymarketActivity,
  type PolymarketPnlPoint,
  type PolymarketPosition,
  type PolymarketPricePoint
} from "@/lib/polymarket";
import type {
  ComparisonPnlPoint,
  DashboardFilters,
  PositionReconciliation,
  SessionComparison
} from "@/lib/types";

export type ComparisonEvent = {
  createdAt: Date;
  eventType: string;
  status: string;
  conditionId: string | null;
  clobTokenId: string | null;
  marketTitle: string | null;
  outcome: string | null;
  side: string | null;
  requestedShares: number | null;
  filledShares: number | null;
  price: number | null;
  grossCash: number | null;
  fee: number | null;
  targetShares: number | null;
  heldAfter: number | null;
  sourcePositionSize: number | null;
  contextJson: string | null;
};

type LocalPosition = {
  key: string;
  conditionId: string;
  asset: string;
  market: string;
  outcome: string;
  requested: number;
  filled: number;
  expected: number;
  current: number;
  buyCost: number;
  sellProceeds: number;
  realizedPnl: number;
  costBasis: number;
  entry?: ComparisonEvent;
  exit?: ComparisonEvent;
  fees: number;
};

type PortfolioFill = {
  timestamp: number;
  conditionId: string;
  asset: string;
  side: "BUY" | "SELL" | "REDEEM";
  shares: number;
  cash: number;
  fee: number;
  price: number;
};

function number(value: number | null | undefined) {
  return value && Number.isFinite(value) ? value : 0;
}

function normalizeOutcome(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function keyFor(conditionId: string, asset?: string, outcome?: string) {
  return `${conditionId}:${asset || normalizeOutcome(outcome) || "unknown"}`;
}

function parseContext(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function contextNumber(event: ComparisonEvent, key: string) {
  const value = parseContext(event.contextJson)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function contextDate(event: ComparisonEvent, key: string) {
  const value = parseContext(event.contextJson)[key];
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function median(values: number[]) {
  if (values.length === 0) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function closestActivity(
  rows: PolymarketActivity[],
  timestamp: number,
  side: "BUY" | "SELL"
) {
  return rows
    .filter((row) => row.type === "TRADE" && row.side === side)
    .sort((a, b) => Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp))[0];
}

function buildLocalPositions(events: ComparisonEvent[]) {
  const positions = new Map<string, LocalPosition>();
  for (const event of events) {
    if (!event.conditionId || !event.clobTokenId) continue;
    if (!["FILLED", "PARTIAL", "RESOLVED"].includes(event.status.toUpperCase())) continue;
    const side = event.side?.toUpperCase();
    if (side !== "BUY" && side !== "SELL") continue;
    const shares = number(event.filledShares);
    if (shares <= 0) continue;
    const key = keyFor(event.conditionId, event.clobTokenId, event.outcome ?? undefined);
    const position = positions.get(key) ?? {
      key,
      conditionId: event.conditionId,
      asset: event.clobTokenId,
      market: event.marketTitle ?? "Unknown market",
      outcome: event.outcome ?? "",
      requested: 0,
      filled: 0,
      expected: 0,
      current: 0,
      buyCost: 0,
      sellProceeds: 0,
      realizedPnl: 0,
      costBasis: 0,
      fees: 0
    };
    const fee = Math.abs(number(event.fee));
    const cash = number(event.grossCash) || shares * number(event.price);
    position.requested += number(event.requestedShares);
    position.filled += shares;
    position.expected = Math.max(
      position.expected,
      number(event.targetShares),
      contextNumber(event, "target_local_shares") ?? 0
    );
    position.fees += fee;
    if (side === "BUY") {
      position.entry ??= event;
      position.current += shares;
      position.buyCost += cash + fee;
      position.costBasis += cash + fee;
    } else {
      position.exit = event;
      const covered = Math.min(position.current, shares);
      const averageCost = position.current > 0 ? position.costBasis / position.current : 0;
      const releasedCost = averageCost * covered;
      position.current = Math.max(0, position.current - covered);
      position.costBasis = Math.max(0, position.costBasis - releasedCost);
      position.sellProceeds += cash - fee;
      position.realizedPnl += cash - fee - releasedCost;
    }
    if (event.heldAfter !== null) position.current = Math.max(0, event.heldAfter);
    positions.set(key, position);
  }
  return positions;
}

function sourceRowsFor(
  activity: PolymarketActivity[],
  conditionId: string,
  asset: string,
  outcome: string
) {
  const exact = activity.filter((row) => row.conditionId === conditionId && row.asset === asset);
  if (exact.length > 0) return exact;
  return activity.filter(
    (row) => row.conditionId === conditionId && normalizeOutcome(row.outcome) === normalizeOutcome(outcome)
  );
}

function findPosition(
  rows: PolymarketPosition[],
  conditionId: string,
  asset: string,
  outcome: string
) {
  return rows.find((row) => row.conditionId === conditionId && row.asset === asset) ??
    rows.find(
      (row) => row.conditionId === conditionId && normalizeOutcome(row.outcome) === normalizeOutcome(outcome)
    );
}

function historyDivergence(local: LocalPosition, sourceRows: PolymarketActivity[]) {
  const expectedScale = Math.max(local.expected, 1);
  let localShares = 0;
  let sourceShares = 0;
  let sourcePeak = 0;
  let weighted = 0;
  let duration = 0;
  const changes = [
    ...sourceRows.filter((row) => row.type === "TRADE").map((row) => ({
      at: row.timestamp,
      owner: "source" as const,
      delta: row.side === "BUY" ? row.size : -row.size
    })),
    ...(local.entry ? [{
      at: Math.floor(local.entry.createdAt.getTime() / 1000),
      owner: "local" as const,
      delta: local.filled
    }] : []),
    ...(local.exit ? [{
      at: Math.floor(local.exit.createdAt.getTime() / 1000),
      owner: "local" as const,
      delta: -(local.filled - local.current)
    }] : [])
  ].sort((a, b) => a.at - b.at);
  // Local fills are represented by their final trajectory when detailed source snapshots are sparse.
  if (changes.length === 0) return undefined;
  let previous = changes[0].at;
  for (const change of changes) {
    const span = Math.max(0, change.at - previous);
    const sourceScale = Math.max(sourcePeak, 1);
    weighted += Math.abs(localShares / expectedScale - sourceShares / sourceScale) * span;
    duration += span;
    if (change.owner === "source") {
      sourceShares = Math.max(0, sourceShares + change.delta);
      sourcePeak = Math.max(sourcePeak, sourceShares);
    } else {
      localShares = Math.max(0, localShares + change.delta);
    }
    previous = change.at;
  }
  localShares = local.current;
  const sourceScale = Math.max(sourcePeak, 1);
  const terminal = Math.abs(localShares / expectedScale - sourceShares / sourceScale);
  return Math.min(100, (duration > 0 ? weighted / duration : terminal) * 100);
}

function toPortfolioFills(events: ComparisonEvent[]): PortfolioFill[] {
  return events.flatMap((event) => {
    if (!event.conditionId || !event.clobTokenId) return [];
    const side = event.side?.toUpperCase();
    if (side !== "BUY" && side !== "SELL") return [];
    const shares = number(event.filledShares);
    if (shares <= 0) return [];
    return [{
      timestamp: Math.floor(event.createdAt.getTime() / 1000),
      conditionId: event.conditionId,
      asset: event.clobTokenId,
      side,
      shares,
      cash: number(event.grossCash) || shares * number(event.price),
      fee: Math.abs(number(event.fee)),
      price: number(event.price)
    }];
  });
}

function sourcePortfolioFills(activity: PolymarketActivity[], assets: Set<string>): PortfolioFill[] {
  return activity.flatMap((row) => {
    if (row.isCombo || !assets.has(row.asset)) return [];
    if (row.type === "TRADE" && (row.side === "BUY" || row.side === "SELL")) {
      return [{
        timestamp: row.timestamp,
        conditionId: row.conditionId,
        asset: row.asset,
        side: row.side,
        shares: row.size,
        cash: row.usdcSize || row.size * row.price,
        fee: 0,
        price: row.price
      }];
    }
    return [];
  });
}

function latestPrice(points: PolymarketPricePoint[] | undefined, timestamp: number, fallback: number) {
  if (!points?.length) return fallback;
  let price = fallback;
  for (const point of points) {
    if (point.t > timestamp) break;
    price = point.p;
  }
  return price;
}

function portfolioSeries(
  fills: PortfolioFill[],
  prices: Map<string, PolymarketPricePoint[]>,
  timeline: number[]
) {
  const ordered = fills.slice().sort((a, b) => a.timestamp - b.timestamp);
  const shares = new Map<string, number>();
  const fallbackPrices = new Map<string, number>();
  let cash = 0;
  let index = 0;
  const values: number[] = [];
  for (const timestamp of timeline) {
    while (index < ordered.length && ordered[index].timestamp <= timestamp) {
      const fill = ordered[index];
      const multiplier = fill.side === "BUY" ? 1 : -1;
      shares.set(fill.asset, Math.max(0, (shares.get(fill.asset) ?? 0) + multiplier * fill.shares));
      cash += fill.side === "BUY" ? -(fill.cash + fill.fee) : fill.cash - fill.fee;
      fallbackPrices.set(fill.asset, fill.price);
      index += 1;
    }
    let inventory = 0;
    for (const [asset, quantity] of shares) {
      inventory += quantity * latestPrice(prices.get(asset), timestamp, fallbackPrices.get(asset) ?? 0);
    }
    values.push(cash + inventory);
  }
  const baseline = values[0] ?? 0;
  return values.map((value) => value - baseline);
}

function realizedSeries(fills: PortfolioFill[], timeline: number[]) {
  const ordered = fills.slice().sort((a, b) => a.timestamp - b.timestamp);
  const states = new Map<string, { shares: number; basis: number }>();
  let realized = 0;
  let index = 0;
  return timeline.map((timestamp) => {
    while (index < ordered.length && ordered[index].timestamp <= timestamp) {
      const fill = ordered[index];
      const state = states.get(fill.asset) ?? { shares: 0, basis: 0 };
      if (fill.side === "BUY") {
        state.shares += fill.shares;
        state.basis += fill.cash + fill.fee;
      } else {
        const covered = Math.min(state.shares, fill.shares);
        const averageCost = state.shares > 0 ? state.basis / state.shares : 0;
        const released = averageCost * covered;
        state.shares = Math.max(0, state.shares - covered);
        state.basis = Math.max(0, state.basis - released);
        realized += fill.cash - fill.fee - released;
      }
      states.set(fill.asset, state);
      index += 1;
    }
    return realized;
  });
}

function nativeValue(points: PolymarketPnlPoint[], timestamp: number) {
  let value = points[0]?.p ?? 0;
  for (const point of points) {
    if (point.t > timestamp) break;
    value = point.p;
  }
  return value;
}

function timeline(start: number, end: number) {
  const span = Math.max(1, end - start);
  const step = Math.max(300, Math.ceil(span / 240 / 300) * 300);
  const values: number[] = [];
  for (let at = start; at < end; at += step) values.push(at);
  values.push(end);
  return values;
}

function normalizeSeries(values: number[], denominator: number, unit: "usd" | "percent") {
  if (unit === "usd") return values;
  const safe = Math.max(Math.abs(denominator), 1);
  return values.map((value) => value / safe * 100);
}

export function reconcileSession(input: {
  sessionId: string;
  sourceWallet: string;
  startedAt: Date;
  endedAt: Date;
  events: ComparisonEvent[];
  activity: PolymarketActivity[];
  currentPositions: PolymarketPosition[];
  closedPositions: PolymarketPosition[];
  nativePnl: PolymarketPnlPoint[];
  prices: Map<string, PolymarketPricePoint[]>;
  sourceScope: "matched" | "wallet";
  unit: "usd" | "percent";
  truncated?: boolean;
  warnings?: string[];
}): SessionComparison {
  const local = buildLocalPositions(input.events);
  const localAssets = new Set(Array.from(local.values()).map((position) => position.asset));
  const positions: PositionReconciliation[] = [];

  for (const position of local.values()) {
    const sourceRows = sourceRowsFor(input.activity, position.conditionId, position.asset, position.outcome);
    const current = findPosition(input.currentPositions, position.conditionId, position.asset, position.outcome);
    const closed = findPosition(input.closedPositions, position.conditionId, position.asset, position.outcome);
    const entryAt = position.entry
      ? Math.floor((contextDate(position.entry, "signal_observed_at") ?? position.entry.createdAt).getTime() / 1000)
      : undefined;
    const exitAt = position.exit ? Math.floor(position.exit.createdAt.getTime() / 1000) : undefined;
    const sourceEntry = entryAt === undefined ? undefined : closestActivity(sourceRows, entryAt, "BUY");
    const sourceExit = exitAt === undefined ? undefined : closestActivity(sourceRows, exitAt, "SELL");
    const expected = position.expected || position.requested;
    const fillPercent = position.requested > 0 ? position.filled / position.requested * 100 : undefined;
    const sourcePnl = current?.cashPnl ?? closed?.realizedPnl;
    const notes: string[] = [];
    let verdict: PositionReconciliation["verdict"] = "matched";
    if (sourceRows.some((row) => row.isCombo)) {
      verdict = "unsupported";
      notes.push("Combo leg detail is unavailable.");
    } else if (sourceRows.length === 0 && !current && !closed) {
      verdict = "wrong-outcome";
      notes.push("No matching source outcome token was found.");
    } else if (fillPercent !== undefined && fillPercent < 99) {
      verdict = "partial";
    } else if (expected > 0 && position.current > expected * 1.01) {
      verdict = "overfilled";
    }
    positions.push({
      key: position.key,
      conditionId: position.conditionId,
      asset: position.asset,
      market: position.market,
      outcome: position.outcome,
      ourCurrentShares: position.current,
      sourceCurrentShares: current?.size ?? 0,
      expectedShares: expected,
      requestedShares: position.requested,
      filledShares: position.filled,
      fillPercent,
      entryLagSeconds: sourceEntry && position.entry
        ? position.entry.createdAt.getTime() / 1000 - sourceEntry.timestamp
        : position.entry
          ? contextNumber(position.entry, "signal_to_order_seconds")
          : undefined,
      exitLagSeconds: sourceExit && position.exit
        ? position.exit.createdAt.getTime() / 1000 - sourceExit.timestamp
        : undefined,
      entryPriceDifference: sourceEntry && position.entry
        ? number(position.entry.price) - sourceEntry.price
        : undefined,
      exitPriceDifference: sourceExit && position.exit
        ? number(position.exit.price) - sourceExit.price
        : undefined,
      historyDivergencePercent: historyDivergence(position, sourceRows),
      ourPnl: position.realizedPnl + (position.current * (current?.curPrice ?? position.entry?.price ?? 0) - position.costBasis),
      sourcePnl,
      pnlGap: sourcePnl === undefined ? undefined : position.realizedPnl - sourcePnl,
      verdict,
      notes
    });
  }

  for (const source of [...input.currentPositions, ...input.closedPositions]) {
    if (!input.activity.some((row) => row.conditionId === source.conditionId)) continue;
    const key = keyFor(source.conditionId, source.asset, source.outcome);
    if (local.has(key) || positions.some((position) => position.conditionId === source.conditionId && normalizeOutcome(position.outcome) === normalizeOutcome(source.outcome))) continue;
    positions.push({
      key: `source:${key}`,
      conditionId: source.conditionId,
      asset: source.asset,
      market: source.title,
      outcome: source.outcome,
      ourCurrentShares: 0,
      sourceCurrentShares: source.size,
      expectedShares: 0,
      requestedShares: 0,
      filledShares: 0,
      ourPnl: 0,
      sourcePnl: source.cashPnl || source.realizedPnl,
      pnlGap: -(source.cashPnl || source.realizedPnl),
      verdict: "source-only",
      notes: ["The source traded this outcome but the session did not."]
    });
  }

  const start = Math.floor(input.startedAt.getTime() / 1000);
  const end = Math.floor(input.endedAt.getTime() / 1000);
  const times = timeline(start, end);
  const localFills = toPortfolioFills(input.events);
  const sourceFills = sourcePortfolioFills(input.activity, localAssets);
  const oursRaw = portfolioSeries(localFills, input.prices, times);
  const sourceMatchedRaw = portfolioSeries(sourceFills, input.prices, times);
  const nativeInRange = input.nativePnl.filter((point) => point.t >= start && point.t <= end);
  const nativeBase = nativeValue(input.nativePnl, start);
  const sourceRaw = input.sourceScope === "wallet" && input.nativePnl.length
    ? times.map((at) => nativeValue(input.nativePnl, at) - nativeBase)
    : sourceMatchedRaw;
  const ourCapital = localFills.filter((fill) => fill.side === "BUY").reduce((sum, fill) => sum + fill.cash, 0);
  const sourceCapital = sourceFills.filter((fill) => fill.side === "BUY").reduce((sum, fill) => sum + fill.cash, 0);
  const ours = normalizeSeries(oursRaw, ourCapital, input.unit);
  const source = normalizeSeries(sourceRaw, sourceCapital || Math.abs(nativeBase), input.unit);
  const oursRealized = normalizeSeries(realizedSeries(localFills, times), ourCapital, input.unit);
  const sourceRealized = normalizeSeries(realizedSeries(sourceFills, times), sourceCapital, input.unit);
  const series: ComparisonPnlPoint[] = times.map((at, index) => ({
    when: new Date(at * 1000).toISOString(),
    ours: ours[index] ?? 0,
    source: source[index] ?? 0
  }));
  const realizedSeriesPoints: ComparisonPnlPoint[] = times.map((at, index) => ({
    when: new Date(at * 1000).toISOString(),
    ours: oursRealized[index] ?? 0,
    source: sourceRealized[index] ?? 0
  }));
  const ourPnl = oursRaw.at(-1) ?? 0;
  const sourcePnl = sourceRaw.at(-1) ?? 0;
  const pnlGap = ourPnl - sourcePnl;
  const entryImpact = positions.reduce((sum, row) => sum - (row.entryPriceDifference ?? 0) * row.filledShares, 0);
  const exitImpact = positions.reduce((sum, row) => sum + (row.exitPriceDifference ?? 0) * row.filledShares, 0);
  const sizingImpact = positions.reduce((sum, row) => sum - Math.abs(row.expectedShares - row.filledShares) * 0.5, 0);
  const selectionImpact = positions.filter((row) => row.verdict === "source-only" || row.verdict === "wrong-outcome")
    .reduce((sum, row) => sum - (row.sourcePnl ?? 0), 0);
  const fees = -Array.from(local.values()).reduce((sum, position) => sum + position.fees, 0);
  const explained = selectionImpact + sizingImpact + entryImpact + exitImpact + fees;
  const factors = [
    { label: "Position selection", impact: selectionImpact, detail: "Source-only and wrong-outcome positions." },
    { label: "Sizing", impact: sizingImpact, detail: "Difference between target and filled local shares." },
    { label: "Entry execution", impact: entryImpact, detail: "Our entry price versus the source trade price." },
    { label: "Exit timing", impact: exitImpact, detail: "Our exit price versus the source trade price." },
    { label: "Fees", impact: fees, detail: "Recorded local execution fees." },
    { label: "Residual", impact: pnlGap - explained, detail: "Market moves, unmatched lifecycle events, and interacting effects." }
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const warnings = [...(input.warnings ?? [])];
  if (nativeInRange.length === 0 && input.sourceScope === "wallet") {
    warnings.push("Native wallet PnL had no points in the session window; matched-market reconstruction is shown.");
  }
  if (positions.some((position) => position.verdict === "unsupported")) {
    warnings.push("Combinatorial positions are excluded until their legs can be resolved.");
  }

  return {
    sessionId: input.sessionId,
    sourceWallet: input.sourceWallet,
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    updatedAt: new Date().toISOString(),
    sourceScope: input.sourceScope,
    unit: input.unit,
    series,
    realizedSeries: realizedSeriesPoints,
    positions: positions.sort((a, b) => Math.abs(b.pnlGap ?? 0) - Math.abs(a.pnlGap ?? 0)),
    summary: {
      matchedPositions: positions.filter((row) => row.verdict === "matched").length,
      sourceOnlyPositions: positions.filter((row) => row.verdict === "source-only").length,
      wrongOutcomePositions: positions.filter((row) => row.verdict === "wrong-outcome").length,
      correctSizePositions: positions.filter((row) => row.fillPercent !== undefined && row.fillPercent >= 99 && row.fillPercent <= 101).length,
      partialFillPositions: positions.filter((row) => row.verdict === "partial").length,
      medianEntryLagSeconds: median(positions.flatMap((row) => row.entryLagSeconds === undefined ? [] : [row.entryLagSeconds])),
      medianExitLagSeconds: median(positions.flatMap((row) => row.exitLagSeconds === undefined ? [] : [row.exitLagSeconds])),
      ourPnl,
      sourcePnl,
      pnlGap,
      factors
    },
    warnings,
    truncated: Boolean(input.truncated)
  };
}

export async function getSessionComparison(
  sessionId: string,
  filters: DashboardFilters
): Promise<SessionComparison | undefined> {
  const prisma = getPrisma();
  const session = await prisma.strategySession.findUnique({
    where: { sessionId },
    select: {
      sessionId: true,
      sourceWallet: true,
      startedAt: true,
      endedAt: true,
      lastEventAt: true
    }
  });
  if (!session?.sourceWallet) return undefined;
  const endedAt = session.endedAt ?? session.lastEventAt ?? new Date();
  const sourceScope = filters.sourceScope === "wallet" ? "wallet" : "matched";
  const unit = filters.pnlUnit === "percent" ? "percent" : "usd";

  const events = await prisma.tradeAnalyticsEvent.findMany({
    where: {
      sessionId,
      eventType: { in: ["order_fill", "market_resolution"] },
      status: { in: ["FILLED", "PARTIAL", "RESOLVED"] }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      createdAt: true,
      eventType: true,
      status: true,
      conditionId: true,
      clobTokenId: true,
      marketTitle: true,
      outcome: true,
      side: true,
      requestedShares: true,
      filledShares: true,
      price: true,
      grossCash: true,
      fee: true,
      targetShares: true,
      heldAfter: true,
      sourcePositionSize: true,
      contextJson: true
    }
  });
  const conditionIds = Array.from(new Set(events.flatMap((event) => event.conditionId ? [event.conditionId] : [])));
  const assets = Array.from(new Set(events.flatMap((event) => event.clobTokenId ? [event.clobTokenId] : [])));
  if (conditionIds.length === 0) return undefined;
  const start = Math.floor(session.startedAt.getTime() / 1000);
  const end = Math.floor(endedAt.getTime() / 1000);
  const fidelityMinutes = Math.max(5, Math.ceil((end - start) / 240 / 60));

  try {
    const [activity, current, closed, nativePnl, prices] = await Promise.all([
      getWalletActivity({ user: session.sourceWallet, start, end, conditionIds }),
      getCurrentPositions(session.sourceWallet),
      getClosedPositions(session.sourceWallet),
      getNativePnl(session.sourceWallet, "all").catch(() => []),
      getBatchPriceHistory({ assets, start, end, fidelityMinutes }).catch(() => new Map())
    ]);
    return reconcileSession({
      sessionId,
      sourceWallet: session.sourceWallet,
      startedAt: session.startedAt,
      endedAt,
      events,
      activity: activity.rows,
      currentPositions: current.rows,
      closedPositions: closed.rows,
      nativePnl,
      prices,
      sourceScope,
      unit,
      truncated: activity.truncated || current.truncated || closed.truncated,
      warnings: prices.size === 0 ? ["Historical prices were unavailable; fill prices are used as fallback marks."] : []
    });
  } catch (error) {
    return {
      sessionId,
      sourceWallet: session.sourceWallet,
      startedAt: session.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      updatedAt: new Date().toISOString(),
      sourceScope,
      unit,
      series: [],
      realizedSeries: [],
      positions: [],
      summary: {
        matchedPositions: 0,
        sourceOnlyPositions: 0,
        wrongOutcomePositions: 0,
        correctSizePositions: 0,
        partialFillPositions: 0,
        ourPnl: 0,
        sourcePnl: 0,
        pnlGap: 0,
        factors: []
      },
      warnings: [],
      truncated: false,
      error: error instanceof Error ? error.message : "Unable to load wallet comparison."
    };
  }
}
