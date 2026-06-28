import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import type {
  BreakdownItem,
  DashboardData,
  DashboardFilters,
  DeploymentSummary,
  Kpi,
  MarketPositionSummary,
  PnlPoint,
  PortfolioSizingSnapshot,
  RecentEvidence,
  RuntimeMode,
  RunStatus,
  SessionSummary
} from "@/lib/types";

type SignalWallet = {
  wallet?: string;
  size?: number;
};

type EventLite = {
  id: bigint;
  createdAt: Date;
  eventType: string;
  status: string;
  strategyName: string;
  allocationMode: string | null;
  paperMode: boolean;
  sessionId: string | null;
  deploymentId: string | null;
  deploymentKey: string | null;
  instanceName: string | null;
  configProfile: string | null;
  marketId: string | null;
  clobTokenId: string | null;
  conditionId: string | null;
  marketTitle: string | null;
  outcome: string | null;
  side: string | null;
  requestedShares: number | null;
  filledShares: number | null;
  sourceWallet: string | null;
  signalWalletsJson: string | null;
  targetDollars: number | null;
  targetShares: number | null;
  fee: number | null;
  netCashDelta: number | null;
  grossCash: number | null;
  price: number | null;
  orderId: string | null;
  sourcePositionSize: number | null;
  contextJson: string | null;
};

type EventWithContext = EventLite & {
  context: Record<string, unknown>;
  marketMeta?: MarketMeta;
};

type TradeLite = {
  id: bigint;
  marketId: string;
  createdAt: Date | null;
  timestamp: string;
  action: string;
  pnl: string;
  pos: number;
  price: number;
  verified: boolean;
  sessionId: string | null;
  instanceName?: string | null;
  signalWalletsJson: string | null;
  topInsiderWallet: string | null;
  market: { question: string } | null;
  paperMode: boolean;
};

type TradeRow = Omit<TradeLite, "paperMode">;

type MutableSummary = DeploymentSummary & {
  tradeSizeTotal: number;
};

type MarketAccumulator = {
  key: string;
  market: string;
  outcome?: string;
  asset?: string;
  conditionId?: string;
  marketType?: string;
  liquidity?: number;
  slug?: string;
  sourcePositionSize?: number;
  signalStrength?: number;
  confidenceScore?: number;
  boughtShares: number;
  buyCost: number;
  soldShares: number;
  sellProceeds: number;
  openShares: number;
  costBasis: number;
  realizedPnl: number;
  lastPrice?: number;
  fees: number;
  fillCount: number;
  resolved: boolean;
  firstTradeAt?: string;
  lastTradeAt?: string;
};

type LifecycleMetrics = {
  marketPositions: MarketPositionSummary[];
  realizedPnl: number;
  unrealizedPnl?: number;
  totalFees: number;
  totalVolume: number;
  tradeCount: number;
  resolvedMarkets: number;
  wins: number;
  losses: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  expectancyPerTrade: number;
  averageWin: number;
  averageLoss: number;
  winLossRatio: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  averageTradeSize: number;
  averagePnlPerResolvedMarket: number;
  pnlSeries: PnlPoint[];
  maxDrawdown: number;
  sharpeRatio: number;
  pnlVolatility: number;
  downsideDeviation: number;
  maxCapitalDeployed: number;
  worstMarket?: string;
  worstMarketPnl: number;
  exposureByAsset: BreakdownItem[];
  pnlByMarketType: BreakdownItem[];
  pnlByAsset: BreakdownItem[];
  pnlByTimeOfDay: BreakdownItem[];
  pnlByLiquidityBucket: BreakdownItem[];
  pnlBySourcePositionSize: BreakdownItem[];
  pnlBySignalStrength: BreakdownItem[];
  pnlByConfidenceScore: BreakdownItem[];
  averageSlippage?: number;
  averageSignalToOrderSeconds?: number;
  averageOrderToResolutionSeconds?: number;
};

type MarketMeta = {
  id: string;
  question: string;
  clobTokenId: string | null;
  conditionId: string | null;
  slug: string | null;
  liquidity: number | null;
  category: string | null;
};

const LIFECYCLE_FILL_EVENT_TYPES = [
  "order_fill",
  "fractional_fak_fill",
  "market_resolution"
] as const;

function isLifecycleFillEvent(event: Pick<EventLite, "eventType">) {
  return (LIFECYCLE_FILL_EVENT_TYPES as readonly string[]).includes(event.eventType);
}

type OverviewMetricRow = {
  kind: "session" | "deployment";
  id: string;
  totalPnl: number;
  fees: number;
  trades: number;
  totalVolume: number;
  markets: number;
  wins: number;
  losses: number;
  lastTradeAt: Date | null;
};

function parseNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "NA") return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseWallets(json: string | null | undefined): SignalWallet[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as SignalWallet[]) : [];
  } catch {
    return [];
  }
}

function firstWallet(json: string | null | undefined) {
  return parseWallets(json)[0]?.wallet ?? "Unknown";
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function optionalNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function average(values: number[]) {
  return values.length === 0
    ? undefined
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function sharpeRatio(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const volatility = standardDeviation(values);
  return volatility === 0 ? 0 : (mean / volatility) * Math.sqrt(values.length);
}

function slippageForEvent(event: EventWithContext) {
  const actual = parseNumber(event.price);
  const requested =
    optionalNumber(event.context.requested_price) ??
    optionalNumber(event.context.reference_price);
  const side = event.side?.toUpperCase();
  if (actual <= 0 || requested === undefined || requested <= 0) return undefined;
  if (side === "SELL") return requested - actual;
  return actual - requested;
}

function legacySlippageForEvent(event: EventWithContext) {
  const actual = parseNumber(event.price);
  const targetDollars = parseNumber(event.targetDollars);
  const targetShares = parseNumber(event.targetShares);
  if (actual <= 0 || targetDollars <= 0 || targetShares <= 0) return undefined;
  const targetPrice = targetDollars / targetShares;
  return event.side?.toUpperCase() === "SELL" ? targetPrice - actual : actual - targetPrice;
}

function signalToOrderSeconds(event: EventWithContext) {
  const explicit = optionalNumber(event.context.signal_to_order_seconds);
  if (explicit !== undefined && explicit >= 0) return explicit;
  const observedAt =
    typeof event.context.signal_observed_at === "string"
      ? new Date(event.context.signal_observed_at)
      : undefined;
  if (!observedAt || Number.isNaN(observedAt.getTime())) return undefined;
  const seconds = (event.createdAt.getTime() - observedAt.getTime()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function stringFromContext(
  record: Record<string, unknown>,
  key: string,
) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseJsonRecord(json: string | null | undefined): Record<string, unknown> | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function parseSizingSnapshot(json: string | null | undefined): PortfolioSizingSnapshot | undefined {
  const source = parseJsonRecord(json);
  if (!source) return undefined;
  const computedPct = numberFromRecord(source, "computed_pct");
  if (computedPct === undefined) return undefined;

  const summarySource =
    source.summary && typeof source.summary === "object"
      ? (source.summary as Record<string, unknown>)
      : undefined;
  const distributionSource =
    source.distribution && typeof source.distribution === "object"
      ? (source.distribution as Record<string, unknown>)
      : undefined;
  const bins = Array.isArray(distributionSource?.bins)
    ? distributionSource.bins
        .map((bin) => {
          if (!bin || typeof bin !== "object") return undefined;
          const record = bin as Record<string, unknown>;
          const x0 = numberFromRecord(record, "x0");
          const x1 = numberFromRecord(record, "x1");
          const count = numberFromRecord(record, "count");
          return x0 !== undefined && x1 !== undefined && count !== undefined
            ? { x0, x1, count }
            : undefined;
        })
        .filter(Boolean) as Array<{ x0: number; x1: number; count: number }>
    : [];
  const normalFit = Array.isArray(distributionSource?.normal_fit)
    ? distributionSource.normal_fit
        .map((point) => {
          if (!point || typeof point !== "object") return undefined;
          const record = point as Record<string, unknown>;
          const x = numberFromRecord(record, "x");
          const density = numberFromRecord(record, "density");
          return x !== undefined && density !== undefined ? { x, density } : undefined;
        })
        .filter(Boolean) as Array<{ x: number; density: number }>
    : [];

  return {
    computedPct,
    configuredPct: numberFromRecord(source, "configured_pct"),
    percentile: numberFromRecord(source, "percentile"),
    percentileValue: numberFromRecord(source, "percentile_value"),
    riskFraction: numberFromRecord(source, "risk_fraction"),
    riskBudget: numberFromRecord(source, "risk_budget"),
    cycleCap: numberFromRecord(source, "cycle_cap"),
    bankroll: numberFromRecord(source, "bankroll"),
    sampleCount: numberFromRecord(source, "sample_count"),
    source: String(source.source ?? "portfolio sizing"),
    formula: typeof source.formula === "string" ? source.formula : undefined,
    summary: summarySource
      ? {
          average: numberFromRecord(summarySource, "average"),
          median: numberFromRecord(summarySource, "median"),
          stdev: numberFromRecord(summarySource, "stdev"),
          minimum: numberFromRecord(summarySource, "minimum"),
          p75: numberFromRecord(summarySource, "p75"),
          p90: numberFromRecord(summarySource, "p90"),
          p95: numberFromRecord(summarySource, "p95"),
          p99: numberFromRecord(summarySource, "p99"),
          maximum: numberFromRecord(summarySource, "maximum")
        }
      : undefined,
    distribution: {
      bins,
      normalFit,
      maxCount: numberFromRecord(distributionSource ?? {}, "max_count"),
      maxDensity: numberFromRecord(distributionSource ?? {}, "max_density")
    }
  };
}

function selectedMode(filters: DashboardFilters) {
  return filters.mode ?? "paper";
}

function dateRange(filters: DashboardFilters) {
  const start = parseDate(filters.start);
  const end = parseDate(filters.end);
  return start || end
    ? {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {})
      }
    : undefined;
}

function optionList(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort();
}

function normalizeStatus(status: string | null | undefined): RunStatus {
  if (
    status === "active" ||
    status === "stopped" ||
    status === "failed" ||
    status === "archived"
  ) {
    return status;
  }
  return "active";
}

function normalizeMode(mode: string | null | undefined): RuntimeMode {
  return mode === "live" ? "live" : "paper";
}

function shortId(value: string | null | undefined) {
  if (!value) return "unknown";
  return value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function createDeploymentSummary(row: {
  deploymentId: string;
  deploymentKey: string | null;
  strategyFamily: string;
  allocationMode: string | null;
  mode: string;
  status: string;
  sourceWallet: string | null;
  instanceName: string | null;
  containerId: string | null;
  hostname: string | null;
  configProfile: string | null;
  configSnapshotJson: string | null;
  startedAt: Date;
  stoppedAt: Date | null;
}): MutableSummary {
  const id = row.deploymentKey ?? row.deploymentId;
  return baseSummary({
    id,
    deploymentId: row.deploymentId,
    deploymentKey: row.deploymentKey ?? undefined,
    label: row.instanceName ?? shortId(row.deploymentKey ?? row.deploymentId),
    strategyFamily: row.strategyFamily,
    strategyName: row.strategyFamily,
    allocationMode: row.allocationMode ?? "default",
    mode: normalizeMode(row.mode),
    status: normalizeStatus(row.status),
    instanceName: row.instanceName ?? "container",
    containerId: row.containerId ?? undefined,
    hostname: row.hostname ?? undefined,
    configProfile: row.configProfile ?? "default",
    startedAt: row.startedAt.toISOString(),
    stoppedAt: row.stoppedAt?.toISOString(),
    followedWallet: row.sourceWallet ?? "Unknown"
  });
}

function createSessionSummary(row: {
  sessionId: string;
  deploymentId: string | null;
  deploymentKey: string | null;
  strategyFamily: string;
  allocationMode: string | null;
  label: string | null;
  mode: string;
  status: string;
  sourceWallet: string | null;
  polymarketWalletUrl: string | null;
  instanceName: string | null;
  containerId: string | null;
  hostname: string | null;
  configProfile: string | null;
  configSnapshotJson: string | null;
  sizingSnapshotJson: string | null;
  startedAt: Date;
  endedAt: Date | null;
  lastEventAt: Date | null;
}): MutableSummary & SessionSummary {
  return {
    ...baseSummary({
      id: row.sessionId,
      deploymentId: row.deploymentId ?? undefined,
      deploymentKey: row.deploymentKey ?? undefined,
      label: row.label ?? shortId(row.sessionId),
      strategyFamily: row.strategyFamily,
      strategyName: row.strategyFamily,
      allocationMode: row.allocationMode ?? "default",
      mode: normalizeMode(row.mode),
      status: normalizeStatus(row.status),
      instanceName: row.instanceName ?? "standalone",
      containerId: row.containerId ?? undefined,
      hostname: row.hostname ?? undefined,
      configProfile: row.configProfile ?? "default",
      startedAt: row.startedAt.toISOString(),
      stoppedAt: row.endedAt?.toISOString(),
      lastTradeAt: row.lastEventAt?.toISOString(),
      followedWallet: row.sourceWallet ?? "Unknown"
    }),
    deploymentId: row.deploymentId ?? undefined,
    deploymentKey: row.deploymentKey ?? undefined,
    sessionId: row.sessionId,
    polymarketWalletUrl: row.polymarketWalletUrl ?? undefined,
    configSnapshot: parseJsonRecord(row.configSnapshotJson),
    sizing: parseSizingSnapshot(row.sizingSnapshotJson),
    marketPositions: []
  };
}

function baseSummary(input: {
  id: string;
  deploymentId?: string;
  deploymentKey?: string;
  label: string;
  strategyFamily: string;
  strategyName: string;
  allocationMode: string;
  mode: RuntimeMode;
  status: RunStatus;
  instanceName: string;
  containerId?: string;
  hostname?: string;
  configProfile: string;
  startedAt: string;
  stoppedAt?: string;
  lastTradeAt?: string;
  followedWallet: string;
}): MutableSummary {
  return {
    ...input,
    totalPnl: 0,
    realizedPnl: 0,
    netPnlAfterFees: 0,
    netPnl: 0,
    grossPnl: 0,
    fees: 0,
    trades: 0,
    markets: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    averageTradeSize: 0,
    totalVolume: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    profitFactor: 0,
    bestTrade: 0,
    worstTrade: 0,
    fillFailureRate: 0,
    fillRate: 0,
    failedOrderRate: 0,
    skippedOpportunityCount: 0,
    partialFillRate: 0,
    cancelRate: 0,
    rejectedOrderCount: 0,
    averageFeePerFill: 0,
    cashDrag: 0,
    unusedAllocation: 0,
    maxCapitalDeployed: 0,
    resolvedMarkets: 0,
    averagePnlPerResolvedMarket: 0,
    maxIntradayDrawdown: 0,
    worstMarketPnl: 0,
    worstFiveMinuteWindow: 0,
    worstFifteenMinuteWindow: 0,
    worstOneHourWindow: 0,
    pnlVolatility: 0,
    downsideDeviation: 0,
    expectancyPerTrade: 0,
    averageWin: 0,
    averageLoss: 0,
    winLossRatio: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    exposureByAsset: [],
    pnlByWallet: [],
    pnlByConfig: [],
    pnlByAllocationMode: [],
    pnlByMarketType: [],
    pnlByAsset: [],
    pnlByTimeOfDay: [],
    pnlByLiquidityBucket: [],
    pnlBySourcePositionSize: [],
    pnlBySignalStrength: [],
    pnlByConfidenceScore: [],
    dataQuality: emptyDataQuality(),
    activeDeployments: 0,
    activeContainers: 0,
    lastTradeAt: input.lastTradeAt,
    sessionCount: 0,
    pnlSeries: [],
    tradeSizeTotal: 0
  };
}

function addPoint(summary: MutableSummary, point: PnlPoint, fee = 0, size = 0) {
  summary.netPnl = point.value;
  summary.grossPnl += point.delta;
  summary.fees += Math.abs(fee);
  summary.trades += 1;
  summary.totalVolume += Math.abs(size);
  summary.tradeSizeTotal += Math.abs(size);
  if (point.delta > 0) summary.wins += 1;
  if (point.delta < 0) summary.losses += 1;
  summary.bestTrade = Math.max(summary.bestTrade, point.delta);
  summary.worstTrade = Math.min(summary.worstTrade, point.delta);
  summary.lastTradeAt = point.when;
  summary.pnlSeries.push(point);
}

function addEvent(summary: MutableSummary, event: EventLite) {
  if (event.eventType === "sizing_snapshot") return;
  const previous = summary.pnlSeries.at(-1)?.value ?? summary.netPnl;
  const delta = parseNumber(event.netCashDelta);
  addPoint(
    summary,
    {
      when: event.createdAt.toISOString(),
      value: previous + delta,
      delta,
      price: event.price ?? undefined,
      market: event.marketTitle ?? undefined,
      action: event.eventType
    },
    parseNumber(event.fee),
    parseNumber(event.targetDollars) || Math.abs(parseNumber(event.grossCash))
  );
}

function addTrade(summary: MutableSummary, trade: TradeLite) {
  const previous = summary.pnlSeries.at(-1)?.value ?? summary.netPnl;
  const delta = parseNumber(trade.pnl);
  const when = (trade.createdAt ?? new Date(trade.timestamp)).toISOString();
  addPoint(summary, {
    when,
    value: previous + delta,
    delta,
    price: trade.price,
    market: trade.market?.question ?? trade.marketId,
    action: trade.action
  }, 0, trade.price * trade.pos);
}

function emptyDataQuality() {
  return {
    missingMarketResolutions: 0,
    eventsWithoutSessionId: 0,
    eventsWithoutSourceWallet: 0,
    eventsWithoutConfigSnapshot: 0,
    duplicateOrderIds: 0,
    duplicateEventRows: 0,
    nullNetCashDelta: 0,
    inconsistentMarketTitles: 0,
    staleContainers: 0,
    eventsFromUnknownDeployments: 0
  };
}

function buildLifecycleMetrics(events: EventWithContext[]): LifecycleMetrics {
  const markets = new Map<string, MarketAccumulator>();
  const pnlSeries: PnlPoint[] = [];
  const realizedTrades: number[] = [];
  const capitalByMarket = new Map<string, number>();
  let realizedPnl = 0;
  let totalFees = 0;
  let totalVolume = 0;
  let tradeCount = 0;
  let maxCapitalDeployed = 0;

  for (const event of events) {
    if (!isLifecycleFillEvent(event)) continue;
    if (
      event.status !== "FILLED" &&
      event.status !== "PARTIAL" &&
      event.status !== "RESOLVED"
    ) continue;
    const side = event.side?.toUpperCase();
    if (side !== "BUY" && side !== "SELL") continue;
    const shares = parseNumber(event.filledShares);
    const grossCash = parseNumber(event.grossCash);
    const fee = Math.abs(parseNumber(event.fee));
    if (shares <= 0) continue;

    const key =
      event.clobTokenId ??
      event.conditionId ??
      event.marketId ??
      event.marketTitle ??
      `event-${event.id.toString()}`;
    const market = markets.get(key) ?? {
      key,
      market: event.marketTitle ?? event.marketMeta?.question ?? "Unknown market",
      outcome: event.outcome ?? stringFromContext(event.context, "source_outcome"),
      asset: event.clobTokenId ?? undefined,
      conditionId: event.conditionId ?? undefined,
      marketType: event.marketMeta?.category ?? undefined,
      liquidity: event.marketMeta?.liquidity ?? undefined,
      slug: event.marketMeta?.slug ?? undefined,
      sourcePositionSize:
        event.sourcePositionSize ??
        optionalNumber(event.context.source_size_observed) ??
        optionalNumber(event.context.source_position_size),
      signalStrength: optionalNumber(event.context.signal_strength),
      confidenceScore: optionalNumber(event.context.confidence_score),
      boughtShares: 0,
      buyCost: 0,
      soldShares: 0,
      sellProceeds: 0,
      openShares: 0,
      costBasis: 0,
      realizedPnl: 0,
      fees: 0,
      fillCount: 0,
      resolved: false
    };

    const when = event.createdAt.toISOString();
    market.lastPrice = parseNumber(event.price) || market.lastPrice;
    market.firstTradeAt ??= when;
    market.lastTradeAt = when;
    market.fillCount += 1;
    market.fees += fee;
    totalFees += fee;
    totalVolume += grossCash;
    tradeCount += 1;

    if (side === "BUY") {
      const cost = grossCash + fee;
      market.boughtShares += shares;
      market.buyCost += cost;
      market.openShares += shares;
      market.costBasis += cost;
      capitalByMarket.set(key, market.costBasis);
      maxCapitalDeployed = Math.max(
        maxCapitalDeployed,
        Array.from(capitalByMarket.values()).reduce((total, value) => total + value, 0)
      );
    } else {
      const proceeds = grossCash - fee;
      const sharesWithBasis = Math.min(shares, market.openShares);
      const averageCost = market.openShares > 0 ? market.costBasis / market.openShares : 0;
      const realizedCost = averageCost * sharesWithBasis;
      const tradePnl = proceeds - realizedCost;

      market.soldShares += shares;
      market.sellProceeds += proceeds;
      market.openShares = Math.max(0, market.openShares - sharesWithBasis);
      market.costBasis = Math.max(0, market.costBasis - realizedCost);
      capitalByMarket.set(key, market.costBasis);
      market.realizedPnl += tradePnl;
      realizedPnl += tradePnl;
      realizedTrades.push(tradePnl);
      pnlSeries.push({
        when,
        value: realizedPnl,
        delta: tradePnl,
        price: event.price ?? undefined,
        market: event.marketTitle ?? event.marketMeta?.question,
        action: event.eventType
      });
      if (market.openShares <= 1e-9 || event.eventType === "market_resolution") {
        market.resolved = true;
      }
    }

    markets.set(key, market);
  }

  const marketAccumulators = Array.from(markets.values());
  const unrealizedValues = marketAccumulators
    .filter(
      (market) =>
        market.openShares > 1e-9 &&
        market.lastPrice !== undefined &&
        market.lastPrice > 0
    )
    .map((market) => market.openShares * market.lastPrice! - market.costBasis);
  const unrealizedPnl =
    unrealizedValues.length === 0
      ? undefined
      : unrealizedValues.reduce((total, value) => total + value, 0);
  const marketPositions = marketAccumulators.map(toMarketPositionSummary);
  const resolvedPositions = marketPositions.filter((position) => position.resolved);
  const wins = resolvedPositions.filter((position) => position.realizedPnl > 0).length;
  const losses = resolvedPositions.filter((position) => position.realizedPnl < 0).length;
  const winningTrades = realizedTrades.filter((value) => value > 0);
  const losingTrades = realizedTrades.filter((value) => value < 0);
  const positivePnl = realizedTrades
    .filter((value) => value > 0)
    .reduce((total, value) => total + value, 0);
  const negativePnl = realizedTrades
    .filter((value) => value < 0)
    .reduce((total, value) => total + Math.abs(value), 0);
  const slippages = events
    .filter((event) => event.eventType === "order_fill")
    .map((event) => slippageForEvent(event) ?? legacySlippageForEvent(event))
    .filter((value): value is number => value !== undefined);
  const signalDurations = events
    .filter((event) => event.eventType === "order_fill")
    .map(signalToOrderSeconds)
    .filter((value): value is number => value !== undefined);
  const resolutionDurations = marketPositions
    .filter((position) => position.resolved && position.firstTradeAt && position.lastTradeAt)
    .map(
      (position) =>
        (new Date(position.lastTradeAt!).getTime() -
          new Date(position.firstTradeAt!).getTime()) /
        1000
    )
    .filter((value) => Number.isFinite(value) && value >= 0);

  return {
    marketPositions: marketPositions.sort(
      (a, b) =>
        new Date(b.lastTradeAt ?? 0).getTime() - new Date(a.lastTradeAt ?? 0).getTime()
    ),
    realizedPnl,
    unrealizedPnl,
    totalFees,
    totalVolume,
    tradeCount,
    resolvedMarkets: resolvedPositions.length,
    wins,
    losses,
    bestTrade: realizedTrades.length ? Math.max(...realizedTrades) : 0,
    worstTrade: realizedTrades.length ? Math.min(...realizedTrades) : 0,
    profitFactor: negativePnl === 0 ? positivePnl : positivePnl / negativePnl,
    expectancyPerTrade:
      realizedTrades.length === 0 ? 0 : realizedPnl / realizedTrades.length,
    averageWin:
      winningTrades.length === 0
        ? 0
        : positivePnl / winningTrades.length,
    averageLoss:
      losingTrades.length === 0
        ? 0
        : -negativePnl / losingTrades.length,
    winLossRatio:
      losingTrades.length === 0 || negativePnl === 0
        ? winningTrades.length
        : (positivePnl / Math.max(1, winningTrades.length)) /
          (negativePnl / losingTrades.length),
    consecutiveWins: longestStreak(realizedTrades, (value) => value > 0),
    consecutiveLosses: longestStreak(realizedTrades, (value) => value < 0),
    averageTradeSize: tradeCount === 0 ? 0 : totalVolume / tradeCount,
    averagePnlPerResolvedMarket:
      resolvedPositions.length === 0 ? 0 : realizedPnl / resolvedPositions.length,
    pnlSeries,
    maxDrawdown: calculateMaxDrawdown(pnlSeries),
    sharpeRatio: sharpeRatio(realizedTrades),
    pnlVolatility: standardDeviation(realizedTrades),
    downsideDeviation: standardDeviation(realizedTrades.filter((value) => value < 0)),
    maxCapitalDeployed,
    worstMarket: resolvedPositions
      .slice()
      .sort((a, b) => a.realizedPnl - b.realizedPnl)[0]?.market,
    worstMarketPnl: resolvedPositions.length
      ? Math.min(...resolvedPositions.map((position) => position.realizedPnl))
      : 0,
    exposureByAsset: breakdown(
      marketPositions,
      (position) => position.outcome ?? position.asset ?? "Unknown",
      (position) => position.openShares * position.averageBuyPrice
    ),
    pnlByMarketType: breakdown(
      marketPositions,
      (position) => position.marketType ?? "unknown",
      (position) => position.realizedPnl
    ),
    pnlByAsset: breakdown(
      marketPositions,
      (position) => position.outcome ?? position.asset ?? "Unknown",
      (position) => position.realizedPnl
    ),
    pnlByTimeOfDay: breakdown(
      marketPositions.filter((position) => position.lastTradeAt),
      (position) => {
        const hour = new Date(position.lastTradeAt!).getHours();
        return `${hour.toString().padStart(2, "0")}:00`;
      },
      (position) => position.realizedPnl
    ),
    pnlByLiquidityBucket: breakdown(
      marketPositions,
      (position) => liquidityBucket(position.liquidity),
      (position) => position.realizedPnl
    ),
    pnlBySourcePositionSize: breakdown(
      marketPositions,
      (position) => dollarBucket(position.sourcePositionSize),
      (position) => position.realizedPnl
    ),
    pnlBySignalStrength: breakdown(
      marketPositions,
      (position) => scoreBucket(position.signalStrength),
      (position) => position.realizedPnl
    ),
    pnlByConfidenceScore: breakdown(
      marketPositions,
      (position) => scoreBucket(position.confidenceScore),
      (position) => position.realizedPnl
    ),
    averageSlippage:
      average(slippages),
    averageSignalToOrderSeconds:
      average(signalDurations),
    averageOrderToResolutionSeconds:
      average(resolutionDurations)
  };
}

function toMarketPositionSummary(market: MarketAccumulator): MarketPositionSummary {
  return {
    key: market.key,
    market: market.market,
    outcome: market.outcome,
    asset: market.asset,
    conditionId: market.conditionId,
    polymarketUrl: market.slug
      ? `https://polymarket.com/event/${market.slug}`
      : market.market
      ? `https://polymarket.com/search?term=${encodeURIComponent(market.market)}`
      : undefined,
    marketType: market.marketType,
    liquidity: market.liquidity,
    sourcePositionSize: market.sourcePositionSize,
    signalStrength: market.signalStrength,
    confidenceScore: market.confidenceScore,
    boughtShares: market.boughtShares,
    buyCost: market.buyCost,
    averageBuyPrice:
      market.boughtShares === 0 ? 0 : market.buyCost / market.boughtShares,
    soldShares: market.soldShares,
    sellProceeds: market.sellProceeds,
    averageSellPrice:
      market.soldShares === 0 ? 0 : market.sellProceeds / market.soldShares,
    openShares: market.openShares,
    realizedPnl: market.realizedPnl,
    fees: market.fees,
    fillCount: market.fillCount,
    resolved: market.resolved,
    firstTradeAt: market.firstTradeAt,
    lastTradeAt: market.lastTradeAt
  };
}

function calculateMaxDrawdown(points: PnlPoint[]) {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    maxDrawdown = Math.max(maxDrawdown, peak - point.value);
  }
  return maxDrawdown;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function longestStreak(values: number[], predicate: (value: number) => boolean) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function breakdown<T>(
  rows: T[],
  labelFor: (row: T) => string,
  valueFor: (row: T) => number
): BreakdownItem[] {
  const groups = new Map<string, BreakdownItem>();
  for (const row of rows) {
    const label = labelFor(row) || "Unknown";
    const current = groups.get(label) ?? { label, value: 0, count: 0 };
    current.value += valueFor(row);
    current.count += 1;
    groups.set(label, current);
  }
  return Array.from(groups.values()).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function dollarBucket(value: number | undefined) {
  if (value === undefined || value <= 0) return "unknown";
  if (value < 100) return "<$100";
  if (value < 500) return "$100-$500";
  if (value < 1_000) return "$500-$1k";
  if (value < 5_000) return "$1k-$5k";
  return "$5k+";
}

function liquidityBucket(value: number | undefined) {
  if (value === undefined || value <= 0) return "unknown";
  if (value < 1_000) return "<$1k";
  if (value < 10_000) return "$1k-$10k";
  if (value < 50_000) return "$10k-$50k";
  if (value < 250_000) return "$50k-$250k";
  return "$250k+";
}

function scoreBucket(value: number | undefined) {
  if (value === undefined) return "unknown";
  if (value < 0.25) return "0-0.25";
  if (value < 0.5) return "0.25-0.5";
  if (value < 0.75) return "0.5-0.75";
  return "0.75-1";
}

function worstWindow(points: PnlPoint[], minutes: number) {
  let worst = 0;
  for (let start = 0; start < points.length; start += 1) {
    const startTime = new Date(points[start].when).getTime();
    let delta = 0;
    for (let index = start; index < points.length; index += 1) {
      const time = new Date(points[index].when).getTime();
      if (time - startTime > minutes * 60_000) break;
      delta += points[index].delta;
    }
    worst = Math.min(worst, delta);
  }
  return worst;
}

function applyLifecycleMetrics(
  summary: MutableSummary & Partial<SessionSummary>,
  metrics: LifecycleMetrics,
) {
  const closed = metrics.wins + metrics.losses;
  summary.realizedPnl = metrics.realizedPnl;
  summary.unrealizedPnl = metrics.unrealizedPnl;
  summary.totalPnl = metrics.realizedPnl + (metrics.unrealizedPnl ?? 0);
  summary.netPnl = summary.totalPnl;
  summary.netPnlAfterFees = summary.totalPnl;
  summary.grossPnl = summary.totalPnl + metrics.totalFees;
  summary.fees = metrics.totalFees;
  summary.trades = metrics.tradeCount;
  summary.totalVolume = metrics.totalVolume;
  summary.averageTradeSize = metrics.averageTradeSize;
  summary.tradeSizeTotal = metrics.totalVolume;
  summary.resolvedMarkets = metrics.resolvedMarkets;
  summary.markets = metrics.marketPositions.length;
  summary.wins = metrics.wins;
  summary.losses = metrics.losses;
  summary.winRate = closed === 0 ? 0 : (metrics.wins / closed) * 100;
  summary.averagePnlPerResolvedMarket = metrics.averagePnlPerResolvedMarket;
  summary.bestTrade = metrics.bestTrade;
  summary.worstTrade = metrics.worstTrade;
  summary.profitFactor = metrics.profitFactor;
  summary.expectancyPerTrade = metrics.expectancyPerTrade;
  summary.averageWin = metrics.averageWin;
  summary.averageLoss = metrics.averageLoss;
  summary.winLossRatio = metrics.winLossRatio;
  summary.consecutiveWins = metrics.consecutiveWins;
  summary.consecutiveLosses = metrics.consecutiveLosses;
  summary.maxDrawdown = metrics.maxDrawdown;
  summary.sharpeRatio = metrics.sharpeRatio;
  summary.maxIntradayDrawdown = metrics.maxDrawdown;
  summary.worstMarket = metrics.worstMarket;
  summary.worstMarketPnl = metrics.worstMarketPnl;
  summary.worstFiveMinuteWindow = worstWindow(metrics.pnlSeries, 5);
  summary.worstFifteenMinuteWindow = worstWindow(metrics.pnlSeries, 15);
  summary.worstOneHourWindow = worstWindow(metrics.pnlSeries, 60);
  summary.pnlVolatility = metrics.pnlVolatility;
  summary.downsideDeviation = metrics.downsideDeviation;
  summary.maxCapitalDeployed = metrics.maxCapitalDeployed;
  summary.averageSlippage = metrics.averageSlippage;
  summary.averageSignalToOrderSeconds = metrics.averageSignalToOrderSeconds;
  summary.averageOrderToResolutionSeconds = metrics.averageOrderToResolutionSeconds;
  summary.exposureByAsset = metrics.exposureByAsset;
  summary.pnlByMarketType = metrics.pnlByMarketType;
  summary.pnlByAsset = metrics.pnlByAsset;
  summary.pnlByTimeOfDay = metrics.pnlByTimeOfDay;
  summary.pnlByLiquidityBucket = metrics.pnlByLiquidityBucket;
  summary.pnlBySourcePositionSize = metrics.pnlBySourcePositionSize;
  summary.pnlBySignalStrength = metrics.pnlBySignalStrength;
  summary.pnlByConfidenceScore = metrics.pnlByConfidenceScore;
  summary.pnlSeries = metrics.pnlSeries;
  summary.lastTradeAt = metrics.pnlSeries.at(-1)?.when ?? summary.lastTradeAt;
  if ("marketPositions" in summary) {
    summary.marketPositions = metrics.marketPositions;
  }
}

function applyExecutionMetrics(summary: MutableSummary, events: EventLite[]) {
  const fills = events.filter(
    (event) =>
      (event.eventType === "order_fill" || event.eventType === "market_resolution") &&
      (event.status === "FILLED" || event.status === "PARTIAL" || event.status === "RESOLVED")
  );
  const failed = events.filter(
    (event) =>
      event.eventType === "order_attempt" &&
      ["FAILED", "REJECTED", "KILLED"].includes(event.status.toUpperCase())
  );
  const rejected = failed.filter((event) =>
    ["REJECTED", "KILLED"].includes(event.status.toUpperCase())
  );
  const canceled = events.filter((event) =>
    ["CANCELLED", "CANCELED"].includes(event.status.toUpperCase())
  );
  const partial = fills.filter(
    (event) =>
      parseNumber(event.requestedShares) > 0 &&
      parseNumber(event.filledShares) + 1e-9 < parseNumber(event.requestedShares)
  );
  const skipped = events.filter((event) => event.eventType === "order_skip");
  const executable = fills.length + failed.length;
  summary.fillRate = executable === 0 ? 0 : (fills.length / executable) * 100;
  summary.failedOrderRate = executable === 0 ? 0 : (failed.length / executable) * 100;
  summary.fillFailureRate = summary.failedOrderRate;
  summary.skippedOpportunityCount = skipped.length;
  summary.partialFillRate = fills.length === 0 ? 0 : (partial.length / fills.length) * 100;
  summary.cancelRate = executable === 0 ? 0 : (canceled.length / executable) * 100;
  summary.rejectedOrderCount = rejected.length;
  summary.averageFeePerFill =
    fills.length === 0
      ? 0
      : fills.reduce((total, event) => total + Math.abs(parseNumber(event.fee)), 0) /
        fills.length;
  summary.unusedAllocation = skipped.reduce(
    (total, event) => total + Math.abs(parseNumber(event.targetDollars)),
    0
  );
  summary.cashDrag = summary.unusedAllocation;
}

function applyDataQualityMetrics(
  summary: MutableSummary,
  events: EventLite[],
  options: {
    knownDeploymentKeys: Set<string>;
    hasConfigSnapshot: boolean;
    lastSeenAt?: string;
    status?: RunStatus;
  }
) {
  const quality = emptyDataQuality();
  const orderIds = new Map<string, number>();
  const eventFingerprints = new Map<string, number>();
  const titlesByMarket = new Map<string, Set<string>>();

  for (const event of events) {
    if (!event.sessionId) quality.eventsWithoutSessionId += 1;
    if (!event.sourceWallet) quality.eventsWithoutSourceWallet += 1;
    if (event.netCashDelta === null) quality.nullNetCashDelta += 1;
    if (
      event.deploymentKey &&
      options.knownDeploymentKeys.size > 0 &&
      !options.knownDeploymentKeys.has(event.deploymentKey)
    ) {
      quality.eventsFromUnknownDeployments += 1;
    }
    if (event.orderId) {
      orderIds.set(event.orderId, (orderIds.get(event.orderId) ?? 0) + 1);
    }
    const fingerprint = [
      event.createdAt.toISOString(),
      event.eventType,
      event.status,
      event.orderId ?? "",
      event.clobTokenId ?? "",
      event.side ?? "",
      event.filledShares ?? "",
      event.grossCash ?? ""
    ].join("|");
    eventFingerprints.set(fingerprint, (eventFingerprints.get(fingerprint) ?? 0) + 1);
    const marketKey = event.marketId ?? event.conditionId ?? event.clobTokenId;
    if (marketKey && event.marketTitle) {
      const titles = titlesByMarket.get(marketKey) ?? new Set<string>();
      titles.add(event.marketTitle);
      titlesByMarket.set(marketKey, titles);
    }
  }

  quality.duplicateOrderIds = Array.from(orderIds.values()).filter((count) => count > 1).length;
  quality.duplicateEventRows = Array.from(eventFingerprints.values()).filter(
    (count) => count > 1
  ).length;
  quality.inconsistentMarketTitles = Array.from(titlesByMarket.values()).filter(
    (titles) => titles.size > 1
  ).length;
  const marketPositions =
    "marketPositions" in summary
      ? (summary as Partial<SessionSummary>).marketPositions ?? []
      : [];
  quality.missingMarketResolutions = marketPositions.filter(
    (position) => position.openShares <= 1e-9 && !position.resolved
  ).length;
  quality.eventsWithoutConfigSnapshot = options.hasConfigSnapshot ? 0 : events.length;
  if (options.status === "active" && options.lastSeenAt) {
    const ageMs = Date.now() - new Date(options.lastSeenAt).getTime();
    quality.staleContainers = ageMs > 15 * 60_000 ? 1 : 0;
  }
  summary.dataQuality = quality;
}

function applyStrategyBreakdowns(summary: MutableSummary) {
  summary.pnlByWallet = [
    {
      label: summary.followedWallet || "Unknown",
      value: summary.realizedPnl,
      count: summary.trades
    }
  ];
  summary.pnlByConfig = [
    {
      label: summary.configProfile || "default",
      value: summary.realizedPnl,
      count: summary.trades
    }
  ];
  summary.pnlByAllocationMode = [
    {
      label: summary.allocationMode || "default",
      value: summary.realizedPnl,
      count: summary.trades
    }
  ];
  if (summary.pnlByMarketType.length === 0) {
    summary.pnlByMarketType = summary.pnlByAsset;
  }
}

function finalizeSummary<T extends MutableSummary>(summary: T): T {
  const closed = summary.wins + summary.losses;
  summary.winRate = closed === 0 ? 0 : (summary.wins / closed) * 100;
  summary.averageTradeSize =
    summary.trades === 0 ? 0 : summary.tradeSizeTotal / summary.trades;
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of summary.pnlSeries) {
    peak = Math.max(peak, point.value);
    maxDrawdown = Math.max(maxDrawdown, peak - point.value);
  }
  summary.maxDrawdown = maxDrawdown;
  if (summary.pnlSeries.length === 0) {
    summary.profitFactor =
      summary.losses === 0 ? summary.wins : summary.wins / Math.max(1, summary.losses);
  }
  return summary;
}

function stripMutable<T extends MutableSummary>(summary: T): Omit<T, "tradeSizeTotal"> {
  const base = { ...summary };
  delete (base as Partial<MutableSummary>).tradeSizeTotal;
  return base as Omit<T, "tradeSizeTotal">;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function buildKpis(summaries: DeploymentSummary[]): Kpi[] {
  const totalPnl = summaries.reduce((total, summary) => total + summary.totalPnl, 0);
  const realizedPnl = summaries.reduce((total, summary) => total + summary.realizedPnl, 0);
  const unrealizedValues = summaries
    .map((summary) => summary.unrealizedPnl)
    .filter((value): value is number => value !== undefined);
  const unrealizedPnl = unrealizedValues.reduce((total, value) => total + value, 0);
  const fees = summaries.reduce((total, summary) => total + summary.fees, 0);
  const trades = summaries.reduce((total, summary) => total + summary.trades, 0);
  const resolvedMarkets = summaries.reduce(
    (total, summary) => total + summary.resolvedMarkets,
    0
  );
  const wins = summaries.reduce((total, summary) => total + summary.wins, 0);
  const losses = summaries.reduce((total, summary) => total + summary.losses, 0);
  const closed = wins + losses;
  const winRate = closed === 0 ? 0 : (wins / closed) * 100;
  const totalVolume = summaries.reduce((total, summary) => total + summary.totalVolume, 0);
  const activeDeployments = summaries.reduce(
    (total, summary) => total + summary.activeDeployments,
    0
  );
  const activeContainers = summaries.reduce(
    (total, summary) => total + summary.activeContainers,
    0
  );

  return [
    {
      label: "Total PnL",
      value: money(totalPnl),
      detail: `${money(realizedPnl)} realized${
        unrealizedValues.length ? ` / ${money(unrealizedPnl)} unrealized` : ""
      }`,
      tone: totalPnl > 0 ? "profit" : totalPnl < 0 ? "loss" : "neutral"
    },
    {
      label: "Net after fees",
      value: money(totalPnl),
      detail: `${money(-fees)} fees`,
      tone: totalPnl > 0 ? "profit" : totalPnl < 0 ? "loss" : "neutral"
    },
    {
      label: "Win rate",
      value: pct(winRate),
      detail: `${wins} wins / ${losses} losses / ${resolvedMarkets} resolved`,
      tone: winRate >= 50 ? "profit" : closed === 0 ? "neutral" : "loss"
    },
    {
      label: "Trades",
      value: trades.toString(),
      detail: `${money(totalVolume)} volume`,
      tone: "neutral"
    },
    {
      label: "Active",
      value: `${activeDeployments}/${activeContainers}`,
      detail: "deployments / containers",
      tone: activeDeployments > 0 ? "profit" : "neutral"
    }
  ];
}

function eventWhere(filters: DashboardFilters) {
  const mode = selectedMode(filters);
  return {
    ...(mode === "all" ? {} : { paperMode: mode === "paper" }),
    ...(filters.strategy && filters.strategy !== "all"
      ? { strategyName: filters.strategy }
      : {}),
    ...(filters.deployment && filters.deployment !== "all"
      ? { deploymentKey: filters.deployment }
      : {}),
    ...(filters.session && filters.session !== "all"
      ? { sessionId: filters.session }
      : {}),
    ...(filters.wallet
      ? {
          OR: [
            { sourceWallet: { contains: filters.wallet, mode: "insensitive" as const } },
            { signalWalletsJson: { contains: filters.wallet, mode: "insensitive" as const } }
          ]
        }
      : {}),
    ...(dateRange(filters) ? { createdAt: dateRange(filters) } : {})
  };
}

function sessionWhere(filters: DashboardFilters) {
  const mode = selectedMode(filters);
  return {
    ...(mode === "all" ? {} : { mode }),
    ...(filters.strategy && filters.strategy !== "all"
      ? { strategyFamily: filters.strategy }
      : {}),
    ...(filters.deployment && filters.deployment !== "all"
      ? { deploymentKey: filters.deployment }
      : {}),
    ...(filters.session && filters.session !== "all"
      ? { sessionId: filters.session }
      : {}),
    ...(filters.wallet
      ? { sourceWallet: { contains: filters.wallet, mode: "insensitive" as const } }
      : {}),
    ...(dateRange(filters) ? { startedAt: dateRange(filters) } : {})
  };
}

function deploymentWhere(filters: DashboardFilters) {
  const mode = selectedMode(filters);
  return {
    deploymentKey: { not: null },
    ...(mode === "all" ? {} : { mode }),
    ...(filters.strategy && filters.strategy !== "all"
      ? { strategyFamily: filters.strategy }
      : {}),
    ...(filters.deployment && filters.deployment !== "all"
      ? { deploymentKey: filters.deployment }
      : {}),
    ...(filters.wallet
      ? { sourceWallet: { contains: filters.wallet, mode: "insensitive" as const } }
      : {}),
    ...(dateRange(filters) ? { startedAt: dateRange(filters) } : {})
  };
}

async function loadOverviewMetrics(
  filters: DashboardFilters,
  sessionIds: string[],
  deploymentKeys: string[]
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`event_type IN ('order_fill', 'fractional_fak_fill', 'market_resolution')`,
    Prisma.sql`status IN ('FILLED', 'PARTIAL', 'RESOLVED')`,
    Prisma.sql`UPPER(side) IN ('BUY', 'SELL')`,
    Prisma.sql`filled_shares > 0`
  ];
  if (sessionIds.length > 0 || deploymentKeys.length > 0) {
    conditions.push(Prisma.sql`(
      session_id IN (${Prisma.join(sessionIds.length ? sessionIds : ["__none__"])})
      OR deployment_key IN (${Prisma.join(deploymentKeys.length ? deploymentKeys : ["__none__"])})
    )`);
  }
  const mode = selectedMode(filters);
  if (mode !== "all") conditions.push(Prisma.sql`paper_mode = ${mode === "paper"}`);
  if (filters.strategy && filters.strategy !== "all") {
    conditions.push(Prisma.sql`strategy_name = ${filters.strategy}`);
  }
  if (filters.deployment && filters.deployment !== "all") {
    conditions.push(Prisma.sql`deployment_key = ${filters.deployment}`);
  }
  if (filters.wallet) {
    conditions.push(Prisma.sql`source_wallet ILIKE ${`%${filters.wallet}%`}`);
  }
  const range = dateRange(filters);
  if (range?.gte) conditions.push(Prisma.sql`created_at >= ${range.gte}`);
  if (range?.lte) conditions.push(Prisma.sql`created_at <= ${range.lte}`);

  const prisma = getPrisma();
  return prisma.$queryRaw<OverviewMetricRow[]>(Prisma.sql`
    WITH position_rollup AS (
      SELECT
        session_id,
        deployment_key,
        COALESCE(clob_token_id, condition_id, market_id, market_title) AS position_key,
        SUM(CASE WHEN UPPER(side) = 'BUY'
          THEN COALESCE(gross_cash, filled_shares * price, 0) + ABS(COALESCE(fee, 0))
          ELSE 0 END)::double precision AS buy_cost,
        SUM(CASE WHEN UPPER(side) = 'SELL'
          THEN COALESCE(gross_cash, filled_shares * price, 0) - ABS(COALESCE(fee, 0))
          ELSE 0 END)::double precision AS sell_proceeds,
        SUM(CASE WHEN UPPER(side) = 'BUY' THEN filled_shares ELSE -filled_shares END)::double precision AS open_shares,
        (ARRAY_AGG(COALESCE(price, 0) ORDER BY created_at DESC, id DESC))[1]::double precision AS last_price,
        SUM(ABS(COALESCE(fee, 0)))::double precision AS fees,
        SUM(ABS(COALESCE(gross_cash, filled_shares * price, 0)))::double precision AS volume,
        COUNT(*)::int AS fills,
        MAX(created_at) AS last_trade_at
      FROM trade_analytics_events
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY session_id, deployment_key, COALESCE(clob_token_id, condition_id, market_id, market_title)
    ), session_rollup AS (
      SELECT
        'session'::text AS kind,
        session_id::text AS id,
        SUM(sell_proceeds + GREATEST(open_shares, 0) * last_price - buy_cost)::double precision AS total_pnl,
        SUM(fees)::double precision AS fees,
        SUM(fills)::int AS trades,
        SUM(volume)::double precision AS total_volume,
        COUNT(*)::int AS markets,
        COUNT(*) FILTER (WHERE ABS(open_shares) < 1e-9 AND sell_proceeds - buy_cost > 0)::int AS wins,
        COUNT(*) FILTER (WHERE ABS(open_shares) < 1e-9 AND sell_proceeds - buy_cost < 0)::int AS losses,
        MAX(last_trade_at) AS last_trade_at
      FROM position_rollup
      WHERE session_id IS NOT NULL
      GROUP BY session_id
    ), deployment_rollup AS (
      SELECT
        'deployment'::text AS kind,
        deployment_key::text AS id,
        SUM(sell_proceeds + GREATEST(open_shares, 0) * last_price - buy_cost)::double precision AS total_pnl,
        SUM(fees)::double precision AS fees,
        SUM(fills)::int AS trades,
        SUM(volume)::double precision AS total_volume,
        COUNT(*)::int AS markets,
        COUNT(*) FILTER (WHERE ABS(open_shares) < 1e-9 AND sell_proceeds - buy_cost > 0)::int AS wins,
        COUNT(*) FILTER (WHERE ABS(open_shares) < 1e-9 AND sell_proceeds - buy_cost < 0)::int AS losses,
        MAX(last_trade_at) AS last_trade_at
      FROM position_rollup
      WHERE deployment_key IS NOT NULL
      GROUP BY deployment_key
    )
    SELECT kind, id, total_pnl AS "totalPnl", fees, trades,
      total_volume AS "totalVolume", markets, wins, losses,
      last_trade_at AS "lastTradeAt"
    FROM session_rollup
    UNION ALL
    SELECT kind, id, total_pnl AS "totalPnl", fees, trades,
      total_volume AS "totalVolume", markets, wins, losses,
      last_trade_at AS "lastTradeAt"
    FROM deployment_rollup
  `);
}

function applyOverviewMetric(summary: MutableSummary, metric: OverviewMetricRow) {
  summary.totalPnl = metric.totalPnl;
  summary.realizedPnl = metric.totalPnl;
  summary.netPnl = metric.totalPnl;
  summary.netPnlAfterFees = metric.totalPnl;
  summary.grossPnl = metric.totalPnl + metric.fees;
  summary.fees = metric.fees;
  summary.trades = metric.trades;
  summary.tradeSizeTotal = metric.totalVolume;
  summary.totalVolume = metric.totalVolume;
  summary.averageTradeSize = metric.trades ? metric.totalVolume / metric.trades : 0;
  summary.markets = metric.markets;
  summary.resolvedMarkets = metric.wins + metric.losses;
  summary.wins = metric.wins;
  summary.losses = metric.losses;
  summary.lastTradeAt = metric.lastTradeAt?.toISOString() ?? summary.lastTradeAt;
}

async function loadSessionTrades(sessionId: string, mode: string) {
  const prisma = getPrisma();
  const [liveTrades, paperTrades] = await Promise.all([
    mode === "paper"
      ? Promise.resolve([])
      : prisma.trade.findMany({
          where: { sessionId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 1000,
          select: {
            id: true,
            marketId: true,
            createdAt: true,
            timestamp: true,
            action: true,
            pnl: true,
            pos: true,
            price: true,
            verified: true,
            sessionId: true,
            signalWalletsJson: true,
            topInsiderWallet: true,
            market: { select: { question: true } }
          }
        }),
    mode === "live"
      ? Promise.resolve([])
      : prisma.paperTrade.findMany({
          where: { sessionId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 1000,
          select: {
            id: true,
            marketId: true,
            createdAt: true,
            timestamp: true,
            action: true,
            pnl: true,
            pos: true,
            price: true,
            verified: true,
            sessionId: true,
            instanceName: true,
            signalWalletsJson: true,
            topInsiderWallet: true,
            market: { select: { question: true } }
          }
        })
  ]);

  return [
    ...(liveTrades as TradeRow[]).map((trade: TradeRow) => ({
      ...trade,
      paperMode: false
    })),
    ...(paperTrades as TradeRow[]).map((trade: TradeRow) => ({
      ...trade,
      paperMode: true
    }))
  ].sort(
    (a: TradeLite, b: TradeLite) =>
      new Date(a.createdAt ?? a.timestamp).getTime() -
      new Date(b.createdAt ?? b.timestamp).getTime()
  ) as TradeLite[];
}

export async function getDashboardData(
  filters: DashboardFilters
): Promise<DashboardData> {
  const loadStartedAt = performance.now();
  const appName =
    process.env.NEXT_PUBLIC_APP_NAME ?? "Wallet Performance Analytics";

  if (!process.env.DATABASE_URL) {
    return emptyDashboard(appName, "Add DATABASE_URL to connect the Neon database.");
  }

  const prisma = getPrisma();
  const mode = selectedMode(filters);
  const selectedSessionId =
    filters.session && filters.session !== "all" ? filters.session : undefined;
  const selectedEventsPromise: Promise<EventLite[]> = selectedSessionId
    ? prisma.tradeAnalyticsEvent.findMany({
        where: eventWhere(filters),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          createdAt: true,
          eventType: true,
          status: true,
          strategyName: true,
          allocationMode: true,
          paperMode: true,
          sessionId: true,
          deploymentId: true,
          deploymentKey: true,
          instanceName: true,
          configProfile: true,
          marketId: true,
          clobTokenId: true,
          conditionId: true,
          marketTitle: true,
          outcome: true,
          side: true,
          requestedShares: true,
          filledShares: true,
          sourceWallet: true,
          signalWalletsJson: true,
          targetDollars: true,
          targetShares: true,
          fee: true,
          netCashDelta: true,
          grossCash: true,
          price: true,
          orderId: true,
          sourcePositionSize: true,
          contextJson: true
        }
      }) as Promise<EventLite[]>
    : Promise.resolve([]);
  const overviewMetricsPromise: Promise<OverviewMetricRow[]> = selectedSessionId
    ? Promise.resolve([])
    : loadOverviewMetrics(filters, [], []);

  try {
    const [deploymentRows, sessionRows] = await Promise.all([
      prisma.strategyDeployment.findMany({
        where: deploymentWhere(filters),
        orderBy: [{ lastHeartbeatAt: "desc" }, { startedAt: "desc" }],
        take: 40,
        select: {
          deploymentId: true,
          deploymentKey: true,
          strategyFamily: true,
          allocationMode: true,
          mode: true,
          status: true,
          sourceWallet: true,
          instanceName: true,
          containerId: true,
          hostname: true,
          configProfile: true,
          configSnapshotJson: true,
          startedAt: true,
          stoppedAt: true,
          lastHeartbeatAt: true
        }
      }),
      prisma.strategySession.findMany({
        where: sessionWhere(filters),
        orderBy: [{ startedAt: "desc" }, { lastEventAt: "desc" }],
        take: filters.deployment && filters.deployment !== "all" ? 120 : 60,
        select: {
          sessionId: true,
          deploymentId: true,
          deploymentKey: true,
          strategyFamily: true,
          allocationMode: true,
          label: true,
          mode: true,
          status: true,
          sourceWallet: true,
          polymarketWalletUrl: true,
          instanceName: true,
          containerId: true,
          hostname: true,
          configProfile: true,
          configSnapshotJson: true,
          sizingSnapshotJson: true,
          startedAt: true,
          endedAt: true,
          lastEventAt: true
        }
      })
    ]);

    const deploymentMap = new Map<string, MutableSummary>();
    const sessionMap = new Map<string, MutableSummary & SessionSummary>();
    const deploymentSessionCounts = new Map<string, number>();
    const deploymentMarkets = new Map<string, Set<string>>();
    const sessionMarkets = new Map<string, Set<string>>();

    for (const row of deploymentRows) {
      if (!row.deploymentKey) continue;
      deploymentMap.set(row.deploymentKey, createDeploymentSummary(row));
    }

    for (const row of sessionRows) {
      const session = createSessionSummary(row);
      sessionMap.set(row.sessionId, session);
      if (row.deploymentKey) {
        deploymentSessionCounts.set(
          row.deploymentKey,
          (deploymentSessionCounts.get(row.deploymentKey) ?? 0) + 1
        );
      }
    }

    const wantedDeploymentKeys = new Set([
      ...deploymentMap.keys(),
      ...sessionRows
        .map((row: { deploymentKey: string | null }) => row.deploymentKey)
        .filter(Boolean)
    ] as string[]);
    const eventReadStartedAt = performance.now();
    let summaryEvents: EventLite[];
    if (selectedSessionId) {
      summaryEvents = await selectedEventsPromise;
    } else {
      summaryEvents = [];
    }
    const eventReadMs = performance.now() - eventReadStartedAt;
    const overviewMetrics = await overviewMetricsPromise;

    const marketIds = Array.from(
      new Set(summaryEvents.map((event) => event.marketId).filter(Boolean) as string[])
    );
    const clobTokenIds = Array.from(
      new Set(summaryEvents.map((event) => event.clobTokenId).filter(Boolean) as string[])
    );
    const conditionIds = Array.from(
      new Set(summaryEvents.map((event) => event.conditionId).filter(Boolean) as string[])
    );
    const marketRows =
      marketIds.length === 0 && clobTokenIds.length === 0 && conditionIds.length === 0
        ? []
        : await prisma.market.findMany({
            where: {
              OR: [
                ...(marketIds.length > 0 ? [{ id: { in: marketIds } }] : []),
                ...(clobTokenIds.length > 0
                  ? [{ clobTokenId: { in: clobTokenIds } }]
                  : []),
                ...(conditionIds.length > 0
                  ? [{ conditionId: { in: conditionIds } }]
                  : [])
              ]
            },
            select: {
              id: true,
              question: true,
              clobTokenId: true,
              conditionId: true,
              slug: true,
              liquidity: true,
              category: true
            }
          });
    const marketMeta = new Map<string, MarketMeta>();
    for (const row of marketRows) {
      marketMeta.set(row.id, row);
      if (row.clobTokenId) marketMeta.set(row.clobTokenId, row);
      if (row.conditionId) marketMeta.set(row.conditionId, row);
    }
    const enrichedEvents: EventWithContext[] = summaryEvents.map((event) => ({
      ...event,
      context: parseJsonRecord(event.contextJson) ?? {},
      marketMeta:
        (event.marketId ? marketMeta.get(event.marketId) : undefined) ??
        (event.clobTokenId ? marketMeta.get(event.clobTokenId) : undefined) ??
        (event.conditionId ? marketMeta.get(event.conditionId) : undefined)
    }));
    const eventsByDeployment = new Map<string, EventWithContext[]>();
    const eventsBySession = new Map<string, EventWithContext[]>();
    const deploymentRowsByKey = new Map(
      deploymentRows.flatMap((row) => row.deploymentKey ? [[row.deploymentKey, row] as const] : [])
    );

    for (const event of enrichedEvents) {
      if (event.deploymentKey && deploymentMap.has(event.deploymentKey)) {
        const deploymentEvents = eventsByDeployment.get(event.deploymentKey) ?? [];
        deploymentEvents.push(event);
        eventsByDeployment.set(event.deploymentKey, deploymentEvents);
        const deployment = deploymentMap.get(event.deploymentKey)!;
        addEvent(deployment, event);
        if (event.marketId) {
          const markets = deploymentMarkets.get(event.deploymentKey) ?? new Set<string>();
          markets.add(event.marketId);
          deploymentMarkets.set(event.deploymentKey, markets);
        }
      }

      if (event.sessionId && sessionMap.has(event.sessionId)) {
        const sessionEvents = eventsBySession.get(event.sessionId) ?? [];
        sessionEvents.push(event);
        eventsBySession.set(event.sessionId, sessionEvents);
        const session = sessionMap.get(event.sessionId)!;
        addEvent(session, event);
        if (event.marketId) {
          const markets = sessionMarkets.get(event.sessionId) ?? new Set<string>();
          markets.add(event.marketId);
          sessionMarkets.set(event.sessionId, markets);
        }
      }
    }

    for (const [key, deployment] of deploymentMap.entries()) {
      const events = eventsByDeployment.get(key) ?? [];
      const row = deploymentRowsByKey.get(key) as
        | {
            configSnapshotJson?: string | null;
            lastHeartbeatAt?: Date | null;
            startedAt?: Date | null;
          }
        | undefined;
      applyLifecycleMetrics(deployment, buildLifecycleMetrics(events));
      applyExecutionMetrics(deployment, events);
      applyStrategyBreakdowns(deployment);
      applyDataQualityMetrics(deployment, events, {
        knownDeploymentKeys: wantedDeploymentKeys,
        hasConfigSnapshot: Boolean(row?.configSnapshotJson),
        lastSeenAt: (row?.lastHeartbeatAt ?? row?.startedAt)?.toISOString(),
        status: deployment.status
      });
    }

    for (const [id, session] of sessionMap.entries()) {
      const events = eventsBySession.get(id) ?? [];
      applyLifecycleMetrics(session, buildLifecycleMetrics(events));
      applyExecutionMetrics(session, events);
      applyStrategyBreakdowns(session);
      applyDataQualityMetrics(session, events, {
        knownDeploymentKeys: wantedDeploymentKeys,
        hasConfigSnapshot: Boolean(session.configSnapshot),
        lastSeenAt: session.lastTradeAt ?? session.startedAt,
        status: session.status
      });
    }

    for (const metric of overviewMetrics) {
      const summary = metric.kind === "session"
        ? sessionMap.get(metric.id)
        : deploymentMap.get(metric.id);
      if (summary) applyOverviewMetric(summary, metric);
    }

    let selectedTrades: TradeLite[] = [];
    if (selectedSessionId && sessionMap.has(selectedSessionId)) {
      selectedTrades = await loadSessionTrades(selectedSessionId, mode);
      const session = sessionMap.get(selectedSessionId)!;
      if (selectedTrades.length > 0 && session.marketPositions.length === 0) {
        session.netPnl = 0;
        session.realizedPnl = 0;
        session.totalPnl = 0;
        session.netPnlAfterFees = 0;
        session.grossPnl = 0;
        session.fees = 0;
        session.trades = 0;
        session.wins = 0;
        session.losses = 0;
        session.pnlSeries = [];
        session.tradeSizeTotal = 0;
        sessionMarkets.set(selectedSessionId, new Set<string>());
        for (const trade of selectedTrades) {
          addTrade(session, trade);
          const markets = sessionMarkets.get(selectedSessionId)!;
          markets.add(trade.marketId);
        }
      }
    }

    const deployments = Array.from(deploymentMap.entries())
      .map(([key, deployment]) => {
        deployment.sessionCount = deploymentSessionCounts.get(key) ?? 0;
        deployment.markets = deployment.markets || deploymentMarkets.get(key)?.size || 0;
        deployment.activeDeployments = deployment.status === "active" ? 1 : 0;
        deployment.activeContainers = deployment.containerId ? 1 : 0;
        return stripMutable(finalizeSummary(deployment)) as DeploymentSummary;
      })
      .sort((a, b) => {
        const sort = filters.deploymentSort ?? "pnl";
        const direction = filters.deploymentDirection ?? "desc";
        const multiplier = direction === "asc" ? 1 : -1;
        if (sort === "date") {
          return multiplier * (
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          );
        }
        return multiplier * (a.netPnl - b.netPnl);
      });

    const sessions = Array.from(sessionMap.entries())
      .map(([id, session]) => {
        session.markets = session.markets || sessionMarkets.get(id)?.size || 0;
        session.activeDeployments = session.deploymentId ? 1 : 0;
        session.activeContainers = session.containerId ? 1 : 0;
        return stripMutable(finalizeSummary(session)) as SessionSummary;
      })
      .sort((a, b) => {
        if (selectedSessionId) return a.sessionId === selectedSessionId ? -1 : 1;
        const sort = filters.sessionSort ?? "date";
        const direction = filters.sessionDirection ?? "desc";
        const multiplier = direction === "asc" ? 1 : -1;
        if (sort === "name") return multiplier * a.label.localeCompare(b.label);
        if (sort === "pnl") return multiplier * (a.netPnl - b.netPnl);
        if (sort === "winRate") return multiplier * (a.winRate - b.winRate);
        if (sort === "trades") return multiplier * (a.trades - b.trades);
        return multiplier * (
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        );
      });

    const evidence =
      selectedSessionId && sessionMap.has(selectedSessionId)
        ? buildEvidence(
            enrichedEvents.filter((event) => event.sessionId === selectedSessionId),
            selectedTrades
          )
        : [];

    const warning =
      mode === "all" ? ["Combined view includes paper and live sessions."] : [];
    const kpiSource = selectedSessionId
      ? sessions
      : deployments.length > 0
      ? deployments
      : sessions;

    const result = {
      appName,
      isConfigured: true,
      warnings: warning,
      kpis: buildKpis(kpiSource),
      deployments,
      sessions,
      wallets: [],
      strategies: [],
      evidence,
      filters: {
        strategies: optionList([
          ...deploymentRows.map(
            (row: { strategyFamily: string }) => row.strategyFamily
          ),
          ...sessionRows.map((row: { strategyFamily: string }) => row.strategyFamily)
        ]),
        deployments: deploymentRows
          .filter((row: { deploymentKey: string | null }) => row.deploymentKey)
          .map((row: { deploymentKey: string | null; instanceName: string | null }) => ({
            label: row.instanceName ?? shortId(row.deploymentKey),
            value: row.deploymentKey!
          }))
          .sort(
            (a: { label: string; value: string }, b: { label: string; value: string }) =>
              a.label.localeCompare(b.label)
          ),
        instances: optionList([
          ...deploymentRows.map((row: { instanceName: string | null }) => row.instanceName),
          ...sessionRows.map((row: { instanceName: string | null }) => row.instanceName)
        ]),
        sessions: optionList(sessionRows.map((row: { sessionId: string }) => row.sessionId)),
        categories: optionList(summaryEvents.map((event) => event.marketTitle)),
        assets: []
      },
      updatedAt: new Date().toISOString()
    };
    console.info("[dashboard-timing]", {
      eventReadMs: Math.round(eventReadMs),
      totalMs: Math.round(performance.now() - loadStartedAt),
      events: summaryEvents.length,
      selectedSessionId
    });
    return result;
  } catch (error) {
    return emptyDashboard(
      appName,
      error instanceof Error ? error.message : "Unable to read dashboard data."
    );
  }
}

function buildEvidence(events: EventWithContext[], trades: TradeLite[]): RecentEvidence[] {
  const evidenceEvents = [
    ...events.filter(isLifecycleFillEvent).slice(-30),
    ...events
      .filter(
        (event) =>
          !isLifecycleFillEvent(event) && event.eventType !== "sizing_snapshot"
      )
      .slice(-10)
  ];
  const eventEvidence: RecentEvidence[] = evidenceEvents
    .map((event) => ({
      id: `event-${event.id.toString()}`,
      when: event.createdAt.toISOString(),
      mode: event.paperMode ? "paper" : "live",
      deploymentId: event.deploymentKey ?? event.deploymentId ?? "standalone",
      sessionId: event.sessionId ?? "unassigned",
      strategy: event.strategyName,
      market: event.marketTitle ?? event.marketMeta?.question ?? "Unknown market",
      wallet: event.sourceWallet ?? firstWallet(event.signalWalletsJson),
      action: event.eventType,
      status: event.status,
      netPnl: parseNumber(event.netCashDelta),
      fee: Math.abs(parseNumber(event.fee))
    }));

  const tradeEvidence: RecentEvidence[] = trades.slice(-30).map((trade) => ({
    id: `trade-${trade.paperMode ? "paper" : "live"}-${trade.id.toString()}`,
    when: (trade.createdAt ?? new Date(trade.timestamp)).toISOString(),
    mode: trade.paperMode ? "paper" : "live",
    deploymentId: "session-trades",
    sessionId: trade.sessionId ?? "unassigned",
    strategy: trade.paperMode ? "paper_trades" : "trades",
    market: trade.market?.question ?? trade.marketId,
    wallet: trade.topInsiderWallet ?? firstWallet(trade.signalWalletsJson),
    action: trade.action,
    status: trade.verified ? "verified" : "recorded",
    netPnl: parseNumber(trade.pnl),
    fee: 0
  }));

  return [...eventEvidence, ...tradeEvidence]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, 40);
}

function emptyDashboard(appName: string, error: string): DashboardData {
  return {
    appName,
    isConfigured: false,
    error,
    warnings: [],
    kpis: [],
    deployments: [],
    sessions: [],
    wallets: [],
    strategies: [],
    evidence: [],
    filters: {
      strategies: [],
      deployments: [],
      instances: [],
      sessions: [],
      categories: [],
      assets: []
    },
    updatedAt: new Date().toISOString()
  };
}
