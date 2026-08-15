import "server-only";

import { getPrisma } from "@/lib/prisma";
import { sessionHistoryScope } from "@/lib/session-history";
import {
  getBatchPriceHistory,
  getClosedPositions,
  getCurrentPositions,
  getMarketByToken,
  getMarketResolution,
  getNativePnl,
  getWalletActivity,
  type PolymarketMarketResolution,
  type PolymarketActivity,
  type PolymarketPnlPoint,
  type PolymarketPosition,
  type PolymarketPricePoint
} from "@/lib/polymarket";
import {
  getCachedReconciliation,
  persistReconciliation
} from "@/lib/reconciliation-persistence";
import type {
  ComparisonPnlPoint,
  DashboardFilters,
  PositionReconciliation,
  SessionComparison
} from "@/lib/types";

const COMPARISON_CACHE_TTL_MS = 60_000;
const COMPARISON_CACHE_LIMIT = 100;
const RESOLUTION_CONCURRENCY = 8;

type ComparisonCacheEntry = {
  expiresAt: number;
  value: Promise<SessionComparison | undefined>;
};

const comparisonCache = new Map<string, ComparisonCacheEntry>();

function comparisonCacheKey(sessionId: string, filters: DashboardFilters) {
  const sourceScope = filters.sourceScope === "wallet" ? "wallet" : "matched";
  const unit = filters.pnlUnit === "usd" ? "usd" : "percent";
  const history = sessionHistoryScope(filters);
  return `${sessionId}:${sourceScope}:${unit}:${history.isFull ? "all" : history.limit}`;
}

function pruneComparisonCache(now: number) {
  for (const [key, entry] of comparisonCache) {
    if (entry.expiresAt <= now) comparisonCache.delete(key);
  }
  while (comparisonCache.size >= COMPARISON_CACHE_LIMIT) {
    const oldestKey = comparisonCache.keys().next().value;
    if (!oldestKey) break;
    comparisonCache.delete(oldestKey);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  map: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await map(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

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

export function reconciliationCacheMaxAgeMs(input: {
  endedAt: Date | null;
  status: string;
}) {
  return input.endedAt || input.status !== "active"
    ? 24 * 60 * 60 * 1000
    : 60 * 1000;
}

type LocalPosition = {
  key: string;
  conditionId: string;
  asset: string;
  market: string;
  outcome: string;
  requested: number;
  filled: number;
  soldShares: number;
  sourceSignalShares: number;
  peakShares: number;
  expected: number;
  current: number;
  buyCash: number;
  buyCost: number;
  sellCash: number;
  sellProceeds: number;
  realizedPnl: number;
  costBasis: number;
  entry?: ComparisonEvent;
  exit?: ComparisonEvent;
  fees: number;
  signalToOrderSeconds: number[];
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

type MarketResolutionMap = Map<string, PolymarketMarketResolution | undefined>;

type OptionalSource<T> = {
  value: T;
  warning?: string;
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

async function loadOptional<T>(label: string, fallback: T, load: () => Promise<T>): Promise<OptionalSource<T>> {
  try {
    return { value: await load() };
  } catch {
    return {
      value: fallback,
      warning: `Polymarket could not load ${label} after retries; this comparison uses source activity without that enrichment.`
    };
  }
}

async function getResolutionMap(conditionIds: string[]): Promise<OptionalSource<MarketResolutionMap>> {
  const resolutions = new Map<string, PolymarketMarketResolution | undefined>();
  let unavailable = 0;
  let nextIndex = 0;
  const concurrency = Math.min(8, conditionIds.length);

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextIndex < conditionIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const conditionId = conditionIds[index];
      try {
        resolutions.set(conditionId, await getMarketResolution(conditionId));
      } catch {
        unavailable += 1;
        resolutions.set(conditionId, undefined);
      }
    }
  }));

  return {
    value: resolutions,
    warning: unavailable > 0
      ? `Polymarket market-resolution data was unavailable for ${unavailable} ${unavailable === 1 ? "market" : "markets"}; settlement enrichment may be incomplete.`
      : undefined
  };
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

// `createdAt` is the analytics persistence time, which can trail the actual
// fill by minutes when the event queue is backlogged.
function eventDate(event: ComparisonEvent) {
  return contextDate(event, "filled_at")
    ?? contextDate(event, "analytics_enqueued_at")
    ?? event.createdAt;
}

function median(values: number[]) {
  if (values.length === 0) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]) {
  return values.length === 0
    ? undefined
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signalToOrderSeconds(event: ComparisonEvent) {
  const explicit = contextNumber(event, "signal_to_order_seconds");
  if (explicit !== undefined && explicit >= 0) return explicit;
  const observedAt = contextDate(event, "signal_observed_at");
  if (!observedAt) return undefined;
  const seconds = (eventDate(event).getTime() - observedAt.getTime()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}


function avgEntry(rows: PolymarketActivity[]) {
  const buys = rows.filter((r) => r.type === "TRADE" && r.side === "BUY");
  if (buys.length === 0) return undefined;
  const totalShares = buys.reduce((s, r) => s + r.size, 0);
  const totalCash = buys.reduce((s, r) => s + r.price * r.size, 0);
  return totalCash / totalShares;
}

function resolvedPayoutPrice(
  resolution: PolymarketMarketResolution | undefined,
  asset: string,
  outcome: string,
  sourcePos?: PolymarketPosition
) {
  return resolutionPrice(resolution, asset, outcome)
    ?? (sourcePos?.curPrice === 0 || sourcePos?.curPrice === 1 ? sourcePos.curPrice : undefined);
}

function avgExit(
  rows: PolymarketActivity[],
  resolution?: PolymarketMarketResolution,
  asset = "",
  outcome = "",
  sourcePos?: PolymarketPosition
) {
  const exits = rows.filter((r) =>
    (r.type === "TRADE" && r.side === "SELL") || r.type === "REDEEM"
  );
  if (exits.length === 0) {
    return undefined;
  }
  let totalCash = 0;
  let totalShares = 0;
  for (const r of exits) {
    if (r.type === "TRADE") {
      totalCash += r.price * r.size;
    } else {
      const payout = resolvedPayoutPrice(resolution, asset, outcome, sourcePos);
      if (payout === undefined) return undefined;
      totalCash += payout * r.size;
    }
    totalShares += r.size;
  }
  return totalCash / totalShares;
}

function resolutionToken(
  resolution: PolymarketMarketResolution | undefined,
  asset: string,
  outcome: string
) {
  if (!resolution?.closed) return undefined;
  return resolution.tokens.find((token) => token.tokenId === asset)
    ?? resolution.tokens.find((token) => normalizeOutcome(token.outcome) === normalizeOutcome(outcome));
}

function resolutionPrice(
  resolution: PolymarketMarketResolution | undefined,
  asset: string,
  outcome: string
) {
  return resolutionToken(resolution, asset, outcome)?.price;
}

function exitType(rows: PolymarketActivity[], sourcePos?: PolymarketPosition, resolution?: PolymarketMarketResolution, asset = "", outcome = "") {
  if (rows.some((r) => r.type === "TRADE" && r.side === "SELL")) return "TRADE";
  if (rows.some((r) => r.type === "REDEEM")) return "REDEEM";
  if (rows.some((r) => r.type === "MERGE")) return "MERGE";
  if (resolutionToken(resolution, asset, outcome)) return "RESOLUTION";
  if (sourcePos?.curPrice === 0 || sourcePos?.curPrice === 1) return "RESOLUTION";
  return undefined;
}

function buildLocalPositions(events: ComparisonEvent[]) {
  const positions = new Map<string, LocalPosition>();
  for (const event of events.slice().sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime())) {
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
      soldShares: 0,
      sourceSignalShares: 0,
      peakShares: 0,
      expected: 0,
      current: 0,
      buyCash: 0,
      buyCost: 0,
      sellCash: 0,
      sellProceeds: 0,
      realizedPnl: 0,
      costBasis: 0,
      fees: 0,
      signalToOrderSeconds: []
    };
    const fee = Math.abs(number(event.fee));
    const cash = number(event.grossCash) || shares * number(event.price);
    position.fees += fee;
    if (side === "BUY") {
      position.requested += number(event.requestedShares);
      position.filled += shares;
      position.sourceSignalShares = Math.max(
        position.sourceSignalShares,
        number(event.sourcePositionSize),
        contextNumber(event, "source_size_observed") ?? 0
      );
      position.expected = Math.max(
        position.expected,
        number(event.targetShares),
        contextNumber(event, "target_local_shares") ?? 0
      );
      position.entry ??= event;
      const signalToOrder = signalToOrderSeconds(event);
      if (signalToOrder !== undefined) position.signalToOrderSeconds.push(signalToOrder);
      position.current += shares;
      position.peakShares = Math.max(position.peakShares, position.current);
      position.buyCash += cash;
      position.buyCost += cash + fee;
      position.costBasis += cash + fee;
    } else {
      position.exit = event;
      const covered = Math.min(position.current, shares);
      const averageCost = position.current > 0 ? position.costBasis / position.current : 0;
      const releasedCost = averageCost * covered;
      position.soldShares += shares;
      position.current = Math.max(0, position.current - covered);
      position.costBasis = Math.max(0, position.costBasis - releasedCost);
      position.sellCash += cash;
      position.sellProceeds += cash - fee;
      position.realizedPnl += cash - fee - releasedCost;
    }
    if (event.heldAfter !== null) position.current = Math.max(0, event.heldAfter);
    if (side === "BUY") position.peakShares = Math.max(position.peakShares, position.current);
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
  const conditionRows = activity.filter((row) => row.conditionId === conditionId);
  const lifecycle = conditionRows.filter(
    (row) => (row.type === "MERGE" || row.type === "REDEEM") && !row.asset
  );
  const exact = conditionRows.filter((row) => row.asset === asset);
  if (exact.length > 0) return [...exact, ...lifecycle];
  const outcomeRows = conditionRows.filter(
    (row) => row.conditionId === conditionId && normalizeOutcome(row.outcome) === normalizeOutcome(outcome)
  );
  return [...outcomeRows, ...lifecycle];
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

function sourceAvgPrice(source: PolymarketPosition | undefined) {
  return source?.avgPrice && source.avgPrice > 0 ? source.avgPrice : undefined;
}

function peakSourceShares(rows: PolymarketActivity[]) {
  let shares = 0;
  let peak = 0;
  for (const row of rows.slice().sort((a, b) => a.timestamp - b.timestamp)) {
    if (row.type !== "TRADE" || (row.side !== "BUY" && row.side !== "SELL")) continue;
    shares = Math.max(0, shares + (row.side === "BUY" ? row.size : -row.size));
    peak = Math.max(peak, shares);
  }
  return peak || undefined;
}

function buyCapital(fills: PortfolioFill[]) {
  return fills
    .filter((fill) => fill.side === "BUY")
    .reduce((sum, fill) => sum + fill.cash, 0);
}

function localAverageBuy(position: LocalPosition) {
  return position.filled > 0 ? position.buyCash / position.filled : undefined;
}

function localAverageSell(position: LocalPosition) {
  return position.soldShares > 0 ? position.sellCash / position.soldShares : undefined;
}

function sourceActivityGroups(activity: PolymarketActivity[], conditionIds: Set<string>) {
  const groups = new Map<string, PolymarketActivity[]>();
  for (const row of activity) {
    if (row.isCombo || row.type !== "TRADE" || (row.side !== "BUY" && row.side !== "SELL") || !row.asset || !conditionIds.has(row.conditionId)) continue;
    const key = keyFor(row.conditionId, row.asset, row.outcome);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function activityCurrentShares(rows: PolymarketActivity[]) {
  return rows.reduce((sum, row) => {
    if (row.type !== "TRADE" || (row.side !== "BUY" && row.side !== "SELL")) return sum;
    return Math.max(0, sum + (row.side === "BUY" ? row.size : -row.size));
  }, 0);
}

function attributedPnl(
  fills: PortfolioFill[],
  prices: Map<string, PolymarketPricePoint[]>,
  start: number,
  end: number
) {
  return portfolioSeries(fills, prices, [start, end]).at(-1) ?? 0;
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
      at: Math.floor(eventDate(local.entry).getTime() / 1000),
      owner: "local" as const,
      delta: local.filled
    }] : []),
    ...(local.exit ? [{
      at: Math.floor(eventDate(local.exit).getTime() / 1000),
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
      timestamp: Math.floor(eventDate(event).getTime() / 1000),
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

function sourcePortfolioFills(
  activity: PolymarketActivity[],
  conditionIds: Set<string>,
  resolutions?: MarketResolutionMap,
  end?: number
): PortfolioFill[] {
  const fills: PortfolioFill[] = [];
  const open = new Map<string, { conditionId: string; asset: string; outcome: string; shares: number }>();
  const ordered = activity
    .filter((row) => !row.isCombo && conditionIds.has(row.conditionId))
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const row of ordered) {
    if (row.type === "TRADE" && (row.side === "BUY" || row.side === "SELL") && row.asset) {
      fills.push({
        timestamp: row.timestamp,
        conditionId: row.conditionId,
        asset: row.asset,
        side: row.side,
        shares: row.size,
        cash: row.usdcSize || row.size * row.price,
        fee: 0,
        price: row.price
      });
      const state = open.get(row.asset) ?? {
        conditionId: row.conditionId,
        asset: row.asset,
        outcome: row.outcome,
        shares: 0
      };
      state.shares = Math.max(0, state.shares + (row.side === "BUY" ? row.size : -row.size));
      state.outcome ||= row.outcome;
      open.set(row.asset, state);
      continue;
    }

    if (row.type !== "REDEEM") continue;
    if (row.asset) {
      const state = open.get(row.asset);
      const shares = row.size || state?.shares || 0;
      if (shares <= 0) continue;
      const payout = resolvedPayoutPrice(resolutions?.get(row.conditionId), row.asset, row.outcome, undefined) ?? row.price;
      fills.push({
        timestamp: row.timestamp,
        conditionId: row.conditionId,
        asset: row.asset,
        side: "REDEEM",
        shares,
        cash: shares * payout,
        fee: 0,
        price: payout
      });
      if (state) {
        state.shares = Math.max(0, state.shares - shares);
        open.set(row.asset, state);
      }
      continue;
    }

    for (const state of Array.from(open.values()).filter((value) => value.conditionId === row.conditionId && value.shares > 0)) {
      const payout = resolutionPrice(resolutions?.get(state.conditionId), state.asset, state.outcome);
      if (payout === undefined) continue;
      fills.push({
        timestamp: row.timestamp,
        conditionId: state.conditionId,
        asset: state.asset,
        side: "REDEEM",
        shares: state.shares,
        cash: state.shares * payout,
        fee: 0,
        price: payout
      });
      state.shares = 0;
      open.set(state.asset, state);
    }
  }

  if (end !== undefined) {
    for (const state of open.values()) {
      if (state.shares <= 0) continue;
      const payout = resolutionPrice(resolutions?.get(state.conditionId), state.asset, state.outcome);
      if (payout === undefined) continue;
      fills.push({
        timestamp: end,
        conditionId: state.conditionId,
        asset: state.asset,
        side: "REDEEM",
        shares: state.shares,
        cash: state.shares * payout,
        fee: 0,
        price: payout
      });
    }
  }

  return fills;
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

function realizedTimeline(start: number, end: number, fills: PortfolioFill[]) {
  return Array.from(new Set([
    start,
    ...fills.flatMap((fill) => fill.timestamp >= start && fill.timestamp <= end ? [fill.timestamp] : []),
    end
  ])).sort((a, b) => a - b);
}

function normalizeSeries(values: number[], denominator: number, unit: "usd" | "percent") {
  if (unit === "usd") return values;
  const safe = Math.max(Math.abs(denominator), 1);
  return values.map((value) => value / safe * 100);
}

async function hydrateMissingConditionIds(events: ComparisonEvent[]) {
  const missingTokens = Array.from(new Set(events.flatMap((event) =>
    !event.conditionId && event.clobTokenId ? [event.clobTokenId] : []
  )));
  if (missingTokens.length === 0) return events;

  const resolved = new Map<string, string>();
  await Promise.all(missingTokens.map(async (tokenId) => {
    const market = await getMarketByToken(tokenId).catch(() => undefined);
    if (market?.conditionId) resolved.set(tokenId, market.conditionId);
  }));

  if (resolved.size === 0) return events;
  return events.map((event) => {
    if (event.conditionId || !event.clobTokenId) return event;
    const conditionId = resolved.get(event.clobTokenId);
    return conditionId ? { ...event, conditionId } : event;
  });
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
  sessionBankroll?: number;
  portfolioSizingPct?: number;
  allSourcePositions?: PolymarketPosition[];
  resolutions?: MarketResolutionMap;
  truncated?: boolean;
  warnings?: string[];
  loadedEventCount?: number;
  historyComplete?: boolean;
}): SessionComparison {
  const local = buildLocalPositions(input.events);
  const localConditionIds = new Set(Array.from(local.values()).map((position) => position.conditionId));
  const start = Math.floor(input.startedAt.getTime() / 1000);
  const end = Math.floor(input.endedAt.getTime() / 1000);
  const localFills = toPortfolioFills(input.events);
  const sourceFills = sourcePortfolioFills(input.activity, localConditionIds, input.resolutions, end);
  const sourceGroups = sourceActivityGroups(input.activity, localConditionIds);
  const ourCapital = Array.from(local.values()).reduce((sum, position) => sum + position.buyCash, 0);
  const sourceCapital = buyCapital(sourceFills);
  const positions: PositionReconciliation[] = [];

  for (const position of local.values()) {
    const sourceRows = sourceRowsFor(input.activity, position.conditionId, position.asset, position.outcome);
    const current = findPosition(input.currentPositions, position.conditionId, position.asset, position.outcome);
    const closed = findPosition(input.closedPositions, position.conditionId, position.asset, position.outcome);
    const sourceEntryPrice = avgEntry(sourceRows);
    const sourcePos = current ?? closed;
    const resolution = input.resolutions?.get(position.conditionId);
    const sourceExitPrice = avgExit(sourceRows, resolution, position.asset, position.outcome, sourcePos)
      ?? resolutionPrice(resolution, position.asset, position.outcome)
      ?? (sourcePos?.curPrice === 0 || sourcePos?.curPrice === 1 ? sourcePos.curPrice : undefined);
    const sourceExitType = exitType(sourceRows, sourcePos, resolution, position.asset, position.outcome);
    const expected = position.expected || position.requested;
    const fillPercent = position.requested > 0 ? position.filled / position.requested * 100 : undefined;
    const sourceCashPnl = current?.cashPnl;
    const sourceRealizedPnl = closed?.realizedPnl;
    const sourcePnl = sourceCashPnl ?? sourceRealizedPnl;
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
    const entryLagSeconds = average(position.signalToOrderSeconds);
    const ourCostBasis = position.costBasis > 0 ? position.costBasis : position.buyCost;
    const ourReturnPct = ourCostBasis > 0 ? (position.realizedPnl / ourCostBasis) * 100 : undefined;
    const sourceCostBasis = sourcePos?.avgPrice && sourcePos.avgPrice > 0
      ? sourcePos.avgPrice * sourcePos.size : 0;
    const sourceReturnPct = sourceCostBasis > 0 && sourcePnl !== undefined
      ? (sourcePnl / sourceCostBasis) * 100 : undefined;
    const positionSourceFills = sourceFills.filter((fill) => fill.asset === position.asset);
    const ourBuyCapital = position.buyCash;
    const sourceBuyCapital = buyCapital(positionSourceFills);
    const sourceAttributedPnl = attributedPnl(positionSourceFills, input.prices, start, end);
    const ourPositionPnl = position.realizedPnl;
    const ourTradeReturnPct = ourBuyCapital > 0 ? ourPositionPnl / ourBuyCapital * 100 : undefined;
    const sourceTradeReturnPct = sourceBuyCapital > 0 ? sourceAttributedPnl / sourceBuyCapital * 100 : undefined;
    const ourReturnContributionPct = ourCapital > 0 ? ourPositionPnl / ourCapital * 100 : undefined;
    const sourceReturnContributionPct = sourceCapital > 0 ? sourceAttributedPnl / sourceCapital * 100 : undefined;
    const sourcePeakShares = peakSourceShares(sourceRows);
    const sourceSignalShares = position.sourceSignalShares || sourcePeakShares;
    const proportionalTargetShares = sourceSignalShares && input.portfolioSizingPct !== undefined
      ? sourceSignalShares * input.portfolioSizingPct : undefined;
    const sizingErrorPct = expected > 0
      ? Math.abs(expected - position.filled) / expected * 100 : undefined;
    const ourEntryPrice = localAverageBuy(position);
    const ourExitPrice = localAverageSell(position);
    const entryPriceDelta = sourceEntryPrice !== undefined && ourEntryPrice !== undefined
      ? ourEntryPrice - sourceEntryPrice : undefined;
    const exitPriceDelta = sourceExitPrice !== undefined && ourExitPrice !== undefined
      ? ourExitPrice - sourceExitPrice : undefined;
    const entryShares = number(position.entry?.filledShares);
    const exitShares = position.soldShares;
    const entryDelayPnl = sourceEntryPrice !== undefined && ourEntryPrice !== undefined
      ? (position.filled || entryShares) * (sourceEntryPrice - ourEntryPrice) : undefined;
    const exitDelayPnl = sourceExitPrice !== undefined && ourExitPrice !== undefined
      ? exitShares * (ourExitPrice - sourceExitPrice) : undefined;
    const ourTargetPct = input.sessionBankroll && input.sessionBankroll > 0
      && position.entry?.price && expected * number(position.entry.price) > 0
      ? (expected * number(position.entry.price)) / input.sessionBankroll * 100
      : undefined;
    const sourceSeenAt = sourceRows.length > 0
      ? sourceRows[0].timestamp : undefined;
    const sourcePositionValue = current?.currentValue ?? closed?.currentValue;
    const ourFillTime = position.entry ? eventDate(position.entry).toISOString() : undefined;
    positions.push({
      key: position.key,
      conditionId: position.conditionId,
      asset: position.asset,
      market: position.market,
      outcome: position.outcome,
      ourCurrentShares: position.current,
      sourceCurrentShares: current?.size ?? activityCurrentShares(sourceRows),
      expectedShares: expected,
      requestedShares: position.requested,
      filledShares: position.filled,
      sourceSignalShares,
      sourcePeakShares,
      portfolioSizingPct: input.portfolioSizingPct,
      proportionalTargetShares,
      ourBoughtShares: position.filled,
      ourPeakShares: position.peakShares,
      enteredAt: position.entry ? eventDate(position.entry).toISOString() : undefined,
      fillPercent,
      entryLagSeconds,
      sourceEntryPrice,
      ourEntryPrice,
      sourceExitPrice,
      ourExitPrice,
      sourceExitType,
      entryPriceDelta,
      exitPriceDelta,
      entryDelayPnl,
      exitDelayPnl,
      historyDivergencePercent: historyDivergence(position, sourceRows),
      ourPnl: ourPositionPnl,
      sourcePnl: sourceAttributedPnl,
      pnlGap: ourPositionPnl - sourceAttributedPnl,
      ourBuyCapital,
      sourceBuyCapital,
      ourFees: position.fees,
      ourTradeReturnPct,
      sourceTradeReturnPct,
      ourReturnContributionPct,
      sourceReturnContributionPct,
      returnGapContributionPct: ourReturnContributionPct !== undefined && sourceReturnContributionPct !== undefined
        ? ourReturnContributionPct - sourceReturnContributionPct : undefined,
      targetDollars: number(position.entry?.targetShares ?? 0) * number(position.entry?.price ?? 0) || undefined,
      targetShares: expected,
      ourTargetPct,
      entryLagMs: entryLagSeconds !== undefined ? entryLagSeconds * 1000 : undefined,
      ourReturnPct,
      sourceCashPnl,
      sourceRealizedPnl,
      sourceReturnPct,
      pnlGapPct: ourReturnPct !== undefined && sourceReturnPct !== undefined
        ? ourReturnPct - sourceReturnPct : undefined,
      sourceSeenAt,
      sourcePositionValue,
      sourceAvgPrice: sourceAvgPrice(current ?? closed),
      ourHeldBefore: position.entry ? number(position.entry.heldAfter) - position.filled : undefined,
      ourHeldAfter: position.entry?.heldAfter ?? undefined,
      ourFillPrice: ourEntryPrice,
      ourFillTime: ourFillTime,
      sizingErrorPct,
      verdict,
      notes
    });
  }

  for (const [key, rows] of sourceGroups) {
    const first = rows.slice().sort((a, b) => a.timestamp - b.timestamp)[0];
    if (!first) continue;
    if (local.has(key) || positions.some((position) => position.conditionId === first.conditionId && normalizeOutcome(position.outcome) === normalizeOutcome(first.outcome))) continue;
    const current = findPosition(input.currentPositions, first.conditionId, first.asset, first.outcome);
    const closed = findPosition(input.closedPositions, first.conditionId, first.asset, first.outcome);
    const sourcePos = current ?? closed;
    const positionSourceFills = sourceFills.filter((fill) => fill.asset === first.asset);
    const sourceBuyCapital = buyCapital(positionSourceFills);
    const sourcePnlOnly = attributedPnl(positionSourceFills, input.prices, start, end);
    const sourceRetOnly = sourceBuyCapital > 0 ? (sourcePnlOnly / sourceBuyCapital) * 100 : undefined;
    const sourceReturnContributionPct = sourceCapital > 0 ? sourcePnlOnly / sourceCapital * 100 : undefined;
    positions.push({
      key: `source:${key}`,
      conditionId: first.conditionId,
      asset: first.asset,
      market: first.title,
      outcome: first.outcome,
      ourCurrentShares: 0,
      sourceCurrentShares: current?.size ?? activityCurrentShares(rows),
      expectedShares: 0,
      requestedShares: 0,
      filledShares: 0,
      sourceEntryPrice: avgEntry(rows),
      sourceExitPrice: avgExit(rows, input.resolutions?.get(first.conditionId), first.asset, first.outcome, sourcePos)
        ?? resolutionPrice(input.resolutions?.get(first.conditionId), first.asset, first.outcome)
        ?? (sourcePos?.curPrice === 0 || sourcePos?.curPrice === 1 ? sourcePos.curPrice : undefined),
      sourceExitType: exitType(rows, sourcePos, input.resolutions?.get(first.conditionId), first.asset, first.outcome),
      ourBoughtShares: 0,
      ourPeakShares: 0,
      ourPnl: 0,
      sourcePnl: sourcePnlOnly,
      pnlGap: -sourcePnlOnly,
      sourceBuyCapital,
      sourceTradeReturnPct: sourceRetOnly,
      sourceReturnContributionPct,
      returnGapContributionPct: sourceReturnContributionPct !== undefined ? -sourceReturnContributionPct : undefined,
      ourTargetPct: undefined,
      entryLagMs: undefined,
      exitLagMs: undefined,
      ourReturnPct: undefined,
      sourceCashPnl: current?.cashPnl,
      sourceRealizedPnl: closed?.realizedPnl,
      sourceReturnPct: sourceRetOnly,
      pnlGapPct: sourceRetOnly !== undefined ? -sourceRetOnly : undefined,
      sourceSeenAt: first.timestamp,
      sourcePositionValue: sourcePos?.currentValue,
      sourceAvgPrice: sourceAvgPrice(sourcePos),
      ourHeldBefore: undefined,
      ourHeldAfter: undefined,
      ourFillPrice: undefined,
      ourFillTime: undefined,
      sizingErrorPct: undefined,
      verdict: "source-only",
      notes: ["The source traded this outcome but the session did not."]
    });
  }

  const times = timeline(start, end);
  const realizedTimes = realizedTimeline(start, end, [...localFills, ...sourceFills]);
  const oursRaw = portfolioSeries(localFills, input.prices, times);
  const sourceMatchedRaw = portfolioSeries(sourceFills, input.prices, times);
  const nativeInRange = input.nativePnl.filter((point) => point.t >= start && point.t <= end);
  const nativeBase = nativeValue(input.nativePnl, start);
  const sourceRaw = input.sourceScope === "wallet" && input.nativePnl.length
    ? times.map((at) => nativeValue(input.nativePnl, at) - nativeBase)
    : sourceMatchedRaw;
  const ours = normalizeSeries(oursRaw, ourCapital, input.unit);
  const source = normalizeSeries(sourceRaw, sourceCapital || Math.abs(nativeBase), input.unit);
  const oursRealized = normalizeSeries(realizedSeries(localFills, realizedTimes), ourCapital, input.unit);
  const sourceRealized = normalizeSeries(realizedSeries(sourceFills, realizedTimes), sourceCapital, input.unit);
  const series: ComparisonPnlPoint[] = times.map((at, index) => ({
    when: new Date(at * 1000).toISOString(),
    ours: ours[index] ?? 0,
    source: source[index] ?? 0
  }));
  const realizedSeriesPoints: ComparisonPnlPoint[] = realizedTimes.map((at, index) => ({
    when: new Date(at * 1000).toISOString(),
    ours: oursRealized[index] ?? 0,
    source: sourceRealized[index] ?? 0
  }));
  const attributedOurPnl = positions.reduce((sum, row) => sum + (row.ourBuyCapital ? row.ourPnl : 0), 0);
  const ourPnl = attributedOurPnl;
  const sourcePnl = sourceRaw.at(-1) ?? 0;
  const pnlGap = ourPnl - sourcePnl;
  const ourReturnPct = ourCapital > 0 ? (ourPnl / ourCapital) * 100 : undefined;
  const sourceReturnPct = sourceCapital > 0 ? (sourcePnl / sourceCapital) * 100 : undefined;
  const pnlGapPct = ourReturnPct !== undefined && sourceReturnPct !== undefined
    ? ourReturnPct - sourceReturnPct : undefined;
  let cumulativeOurReturnPct = 0;
  let cumulativeSourceReturnPct = 0;
  for (const row of positions.slice().sort((a, b) => (a.enteredAt ?? "9999").localeCompare(b.enteredAt ?? "9999"))) {
    if (row.ourReturnContributionPct === undefined && row.sourceReturnContributionPct === undefined) continue;
    if (row.ourReturnContributionPct !== undefined) cumulativeOurReturnPct += row.ourReturnContributionPct;
    if (row.sourceReturnContributionPct !== undefined) cumulativeSourceReturnPct += row.sourceReturnContributionPct;
    row.cumulativeOurReturnPct = cumulativeOurReturnPct;
    row.cumulativeSourceReturnPct = cumulativeSourceReturnPct;
  }
  const attributedSourcePnl = positions.reduce((sum, row) => sum + (row.sourceBuyCapital ? row.sourcePnl ?? 0 : 0), 0);
  const toOurReturnPoints = (dollars: number) => ourCapital > 0 ? dollars / ourCapital * 100 : 0;
  const entryImpact = toOurReturnPoints(positions.reduce((sum, row) => sum + (row.entryDelayPnl ?? 0), 0));
  const exitImpact = toOurReturnPoints(positions.reduce((sum, row) => sum + (row.exitDelayPnl ?? 0), 0));
  const fees = toOurReturnPoints(-Array.from(local.values()).reduce((sum, position) => sum + position.fees, 0));
  const sizingImpact = positions.reduce((sum, row) => {
    if (row.proportionalTargetShares === undefined || row.ourEntryPrice === undefined || row.sourceTradeReturnPct === undefined) return sum;
    const idealCapital = row.proportionalTargetShares * row.ourEntryPrice;
    const actualPeakCapital = row.ourPeakShares * row.ourEntryPrice;
    return sum + toOurReturnPoints((actualPeakCapital - idealCapital) * row.sourceTradeReturnPct / 100);
  }, 0);
  const selectionImpact = positions
    .filter((row) => row.verdict === "source-only" || row.verdict === "wrong-outcome")
    .reduce((sum, row) => sum - (row.sourceReturnContributionPct ?? 0), 0);
  const explained = selectionImpact + sizingImpact + entryImpact + exitImpact + fees;
  const returnGap = pnlGapPct ?? 0;
  const factors = [
    { label: "Position selection", impact: selectionImpact, unit: "pp" as const, detail: "Estimated contribution from source-only and wrong-outcome positions." },
    { label: "Sizing", impact: sizingImpact, unit: "pp" as const, detail: "Estimated effect of peak local exposure versus source shares × sizing percentage." },
    { label: "Entry execution", impact: entryImpact, unit: "pp" as const, detail: "Local shares × (source entry − our entry), normalized by our gross buy capital." },
    { label: "Exit execution", impact: exitImpact, unit: "pp" as const, detail: "Local shares × (our exit − source exit), when both quoted prices exist." },
    { label: "Fees", impact: fees, unit: "pp" as const, detail: "Recorded local fees normalized by our gross buy capital." },
    { label: "Residual", impact: returnGap - explained, unit: "pp" as const, detail: "Unexplained normalized gap: market path, turnover, lifecycle matching, and interacting effects." }
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
    positions: positions.sort((a, b) => (a.enteredAt ?? "9999").localeCompare(b.enteredAt ?? "9999")),
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
      ourReturnPct,
      sourceReturnPct,
      pnlGapPct,
      ourGrossBuyCapital: ourCapital,
      sourceGrossBuyCapital: sourceCapital,
      ourAttributionResidual: ourPnl - attributedOurPnl,
      sourceAttributionResidual: sourcePnl - attributedSourcePnl,
      factors
    },
    warnings,
    truncated: Boolean(input.truncated),
    loadedEventCount: input.loadedEventCount,
    historyComplete: input.historyComplete
  };
}

export async function getSessionComparison(
  sessionId: string,
  filters: DashboardFilters
): Promise<SessionComparison | undefined> {
  const now = Date.now();
  const key = comparisonCacheKey(sessionId, filters);
  const cached = comparisonCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  pruneComparisonCache(now);
  const value = loadSessionComparison(sessionId, filters);
  comparisonCache.set(key, { expiresAt: now + COMPARISON_CACHE_TTL_MS, value });
  return value;
}

export async function getWalletComparison(
  deploymentKey: string,
  sourceWallet: string,
  filters: DashboardFilters
): Promise<SessionComparison | undefined> {
  const prisma = getPrisma();
  const sessions = await prisma.strategySession.findMany({
    where: { deploymentKey, sourceWallet },
    orderBy: { startedAt: "asc" },
    select: {
      sessionId: true,
      startedAt: true,
      endedAt: true,
      lastEventAt: true,
      initialBankroll: true,
      sizingSnapshotJson: true
    }
  });
  if (sessions.length === 0) return undefined;

  const historyScope = sessionHistoryScope(filters);
  const rawEvents = await prisma.tradeAnalyticsEvent.findMany({
    where: { sessionId: { in: sessions.map((session) => session.sessionId) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(historyScope.limit ? { take: historyScope.limit + 1 } : {}),
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
  const hasMoreEvents = historyScope.limit !== undefined && rawEvents.length > historyScope.limit;
  const loadedEvents = (hasMoreEvents ? rawEvents.slice(0, -1) : rawEvents).reverse();
  const events = await hydrateMissingConditionIds(
    loadedEvents.filter(
      (event) =>
        ["order_fill", "fractional_fak_fill", "market_resolution"].includes(event.eventType) &&
        ["FILLED", "PARTIAL", "RESOLVED"].includes(event.status)
    )
  );
  const conditionIds = Array.from(new Set(events.flatMap((event) => event.conditionId ? [event.conditionId] : [])));
  if (conditionIds.length === 0) return undefined;

  const startedAt = sessions[0].startedAt;
  const endedAt = sessions.reduce(
    (latest, session) => {
      const end = session.endedAt ?? session.lastEventAt ?? new Date();
      return end > latest ? end : latest;
    },
    sessions[0].endedAt ?? sessions[0].lastEventAt ?? new Date()
  );
  const start = Math.floor(startedAt.getTime() / 1000);
  const end = Math.floor(endedAt.getTime() / 1000);
  const assets = Array.from(new Set(events.flatMap((event) => event.clobTokenId ? [event.clobTokenId] : [])));
  const sourceScope = filters.sourceScope === "wallet" ? "wallet" : "matched";
  const unit = filters.pnlUnit === "usd" ? "usd" : "percent";

  try {
    const activity = await getWalletActivity({ user: sourceWallet, start, end, conditionIds });
    const [current, closed, nativePnl, resolutions] = await Promise.all([
      loadOptional("current positions", { rows: [] as PolymarketPosition[], truncated: false }, () => getCurrentPositions(sourceWallet, conditionIds)),
      loadOptional("closed positions", { rows: [] as PolymarketPosition[], truncated: false }, () => getClosedPositions(sourceWallet, conditionIds)),
      sourceScope === "wallet"
        ? loadOptional("native wallet PnL", [] as PolymarketPnlPoint[], () => getNativePnl(sourceWallet, "all"))
        : Promise.resolve<OptionalSource<PolymarketPnlPoint[]>>({ value: [] }),
      getResolutionMap(conditionIds)
    ]);
    const priceHistory = await loadOptional(
      "historical prices",
      new Map<string, PolymarketPricePoint[]>(),
      () => getBatchPriceHistory({
        assets: Array.from(new Set([...assets, ...activity.rows.flatMap((row) => row.asset ? [row.asset] : [])])),
        start,
        end,
        fidelityMinutes: Math.max(5, Math.ceil((end - start) / 240 / 60))
      })
    );
    const warnings = [
      current.warning,
      closed.warning,
      nativePnl.warning,
      resolutions.warning,
      priceHistory.warning,
      hasMoreEvents
        ? `Comparison uses the most recent ${loadedEvents.length.toLocaleString()} wallet events. Load more history for a complete comparison.`
        : undefined,
      priceHistory.value.size === 0 ? "Historical prices were unavailable; fill prices are used as fallback marks." : undefined
    ].filter((warning): warning is string => Boolean(warning));
    return reconcileSession({
      sessionId: `wallet:${deploymentKey}:${sourceWallet}`,
      sourceWallet,
      startedAt,
      endedAt,
      events,
      activity: activity.rows,
      currentPositions: current.value.rows,
      closedPositions: closed.value.rows,
      nativePnl: nativePnl.value,
      prices: priceHistory.value,
      sourceScope,
      unit,
      sessionBankroll: sessions.reduce((sum, session) => sum + (session.initialBankroll ?? 0), 0) || undefined,
      portfolioSizingPct: undefined,
      resolutions: resolutions.value,
      truncated: activity.truncated || current.value.truncated || closed.value.truncated,
      warnings,
      loadedEventCount: loadedEvents.length,
      historyComplete: !hasMoreEvents
    });
  } catch (error) {
    return {
      sessionId: `wallet:${deploymentKey}:${sourceWallet}`,
      sourceWallet,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      updatedAt: new Date().toISOString(),
      sourceScope,
      unit,
      series: [],
      realizedSeries: [],
      positions: [],
      summary: {
        matchedPositions: 0, sourceOnlyPositions: 0, wrongOutcomePositions: 0,
        correctSizePositions: 0, partialFillPositions: 0, ourPnl: 0, sourcePnl: 0,
        pnlGap: 0, ourGrossBuyCapital: 0, sourceGrossBuyCapital: 0,
        ourAttributionResidual: 0, sourceAttributionResidual: 0, factors: []
      },
      warnings: [],
      truncated: false,
      loadedEventCount: loadedEvents.length,
      historyComplete: !hasMoreEvents,
      error: error instanceof Error ? error.message : "Unable to load wallet comparison."
    };
  }
}

async function loadSessionComparison(
  sessionId: string,
  filters: DashboardFilters
): Promise<SessionComparison | undefined> {
  const prisma = getPrisma();
  const loadStartedAt = performance.now();
  const session = await prisma.strategySession.findUnique({
    where: { sessionId },
    select: {
      sessionId: true,
      sourceWallet: true,
      startedAt: true,
      endedAt: true,
      lastEventAt: true,
      status: true,
      initialBankroll: true,
      sizingSnapshotJson: true
    }
  });
  if (!session?.sourceWallet) return undefined;
  const sourceWallet = session.sourceWallet;
  const comparisonStartedAt = performance.now();
  const endedAt = session.endedAt ?? session.lastEventAt ?? new Date();
  const sourceScope = filters.sourceScope === "wallet" ? "wallet" : "matched";
  const unit = filters.pnlUnit === "usd" ? "usd" : "percent";
  const historyScope = sessionHistoryScope(filters);
  const maxCacheAgeMs = reconciliationCacheMaxAgeMs(session);
  const cached = historyScope.isFull
    ? await getCachedReconciliation({
        sessionId,
        sourceScope,
        unit,
        maxAgeMs: maxCacheAgeMs
      })
    : undefined;
  if (cached) {
    console.info("[reconciliation-cache] hit", {
      sessionId,
      sourceScope,
      unit,
      totalMs: Math.round(performance.now() - comparisonStartedAt)
    });
    return cached;
  }
  console.info("[reconciliation-cache] miss", { sessionId, sourceScope, unit });
  const sessionBankroll = session.initialBankroll ?? undefined;
  const sizingSnapshot = parseContext(session.sizingSnapshotJson);
  const portfolioSizingPct = typeof sizingSnapshot.computed_pct === "number"
    ? sizingSnapshot.computed_pct : undefined;

  const rawEvents = await prisma.tradeAnalyticsEvent.findMany({
    where: { sessionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(historyScope.limit ? { take: historyScope.limit + 1 } : {}),
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
  const hasMoreEvents = historyScope.limit !== undefined && rawEvents.length > historyScope.limit;
  const loadedEvents = (hasMoreEvents ? rawEvents.slice(0, -1) : rawEvents).reverse();
  const events = await hydrateMissingConditionIds(
    loadedEvents.filter(
      (event) =>
        ["order_fill", "fractional_fak_fill", "market_resolution"].includes(event.eventType) &&
        ["FILLED", "PARTIAL", "RESOLVED"].includes(event.status)
    )
  );
  const conditionIds = Array.from(new Set(events.flatMap((event) => event.conditionId ? [event.conditionId] : [])));
  const assets = Array.from(new Set(events.flatMap((event) => event.clobTokenId ? [event.clobTokenId] : [])));
  if (conditionIds.length === 0) return undefined;
  const start = Math.floor(session.startedAt.getTime() / 1000);
  const end = Math.floor(endedAt.getTime() / 1000);
  const fidelityMinutes = Math.max(5, Math.ceil((end - start) / 240 / 60));

  try {
    const externalStartedAt = performance.now();
    // Activity is the required source of truth. The remaining calls enrich the
    // comparison and must not hide a useful activity-derived result.
    const activity = await getWalletActivity({ user: sourceWallet, start, end, conditionIds });
    const [current, closed, nativePnl, resolutions] = await Promise.all([
      loadOptional("current positions", { rows: [] as PolymarketPosition[], truncated: false }, () => getCurrentPositions(sourceWallet, conditionIds)),
      loadOptional("closed positions", { rows: [] as PolymarketPosition[], truncated: false }, () => getClosedPositions(sourceWallet, conditionIds)),
      sourceScope === "wallet"
        ? loadOptional("native wallet PnL", [] as PolymarketPnlPoint[], () => getNativePnl(sourceWallet, "all"))
        : Promise.resolve<OptionalSource<PolymarketPnlPoint[]>>({ value: [] }),
      getResolutionMap(conditionIds)
    ]);
    const externalMs = performance.now() - externalStartedAt;
    const priceAssets = Array.from(new Set([
      ...assets,
      ...activity.rows.flatMap((row) => row.asset ? [row.asset] : [])
    ]));
    const priceStartedAt = performance.now();
    const priceHistory = await loadOptional("historical prices", new Map<string, PolymarketPricePoint[]>(), () =>
      getBatchPriceHistory({ assets: priceAssets, start, end, fidelityMinutes })
    );
    const priceMs = performance.now() - priceStartedAt;
    const warnings = [
      current.warning,
      closed.warning,
      nativePnl.warning,
      resolutions.warning,
      priceHistory.warning,
      hasMoreEvents
        ? `Comparison uses the most recent ${loadedEvents.length.toLocaleString()} session events. Load more history for a complete comparison.`
        : undefined,
      priceHistory.value.size === 0 ? "Historical prices were unavailable; fill prices are used as fallback marks." : undefined
    ].filter((warning): warning is string => Boolean(warning));
    const reconcileStartedAt = performance.now();
    const result = reconcileSession({
      sessionId,
      sourceWallet: session.sourceWallet,
      startedAt: session.startedAt,
      endedAt,
      events,
      activity: activity.rows,
      currentPositions: current.value.rows,
      closedPositions: closed.value.rows,
      nativePnl: nativePnl.value,
      prices: priceHistory.value,
      sourceScope,
      unit,
      sessionBankroll,
      portfolioSizingPct,
      allSourcePositions: [...current.value.rows, ...closed.value.rows],
      resolutions: resolutions.value,
      truncated: activity.truncated || current.value.truncated || closed.value.truncated,
      warnings,
      loadedEventCount: loadedEvents.length,
      historyComplete: !hasMoreEvents
    });
    console.info("[reconciliation] fresh", {
      sessionId,
      events: events.length,
      markets: conditionIds.length,
      totalMs: Math.round(performance.now() - comparisonStartedAt)
    });
    const reconcileMs = performance.now() - reconcileStartedAt;
    console.info("[session-comparison-timing]", {
      sessionId,
      conditions: conditionIds.length,
      assets: priceAssets.length,
      activity: activity.rows.length,
      currentPositions: current.value.rows.length,
      closedPositions: closed.value.rows.length,
      externalMs: Math.round(externalMs),
      priceMs: Math.round(priceMs),
      reconcileMs: Math.round(reconcileMs),
      totalMs: Math.round(performance.now() - loadStartedAt)
    });
    if (historyScope.isFull) {
      persistReconciliation(result).catch((err) => {
        console.error("Failed to persist reconciliation:", err);
      });
    }
    return result;
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
        ourGrossBuyCapital: 0,
        sourceGrossBuyCapital: 0,
        ourAttributionResidual: 0,
        sourceAttributionResidual: 0,
        factors: []
      },
      warnings: [],
      truncated: false,
      loadedEventCount: loadedEvents.length,
      historyComplete: !hasMoreEvents,
      error: error instanceof Error ? error.message : "Unable to load wallet comparison."
    };
  }
}
