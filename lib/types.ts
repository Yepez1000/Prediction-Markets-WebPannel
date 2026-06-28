export type DashboardFilters = {
  mode?: string;
  strategy?: string;
  deployment?: string;
  instance?: string;
  session?: string;
  category?: string;
  asset?: string;
  wallet?: string;
  source?: string;
  start?: string;
  end?: string;
  pnlView?: "mark" | "realized";
  sourceScope?: "matched" | "wallet";
  pnlUnit?: "usd" | "percent";
  sessionSort?: "date" | "name" | "pnl" | "winRate" | "trades";
  sessionDirection?: "asc" | "desc";
};

export type RuntimeMode = "paper" | "live";
export type RunStatus = "active" | "stopped" | "failed" | "archived";

export type Kpi = {
  label: string;
  value: string;
  detail: string;
  tone?: "profit" | "loss" | "neutral" | "caution";
};

export type WalletSummary = {
  wallet: string;
  netPnl: number;
  grossPnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  averagePositionSize: number;
  bestStrategy: string;
  compatibility: string;
  source: "event" | "signal" | "top-insider";
};

export type StrategySummary = {
  strategy: string;
  allocationMode: string;
  instanceName: string;
  mode: "paper" | "live";
  netPnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  skipped: number;
};

export type DeploymentSummary = {
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
  configProfile: string;
  containerId?: string;
  hostname?: string;
  startedAt: string;
  stoppedAt?: string;
  followedWallet: string;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  netPnlAfterFees: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  trades: number;
  markets: number;
  wins: number;
  losses: number;
  winRate: number;
  averageTradeSize: number;
  totalVolume: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  fillFailureRate: number;
  fillRate: number;
  failedOrderRate: number;
  skippedOpportunityCount: number;
  partialFillRate: number;
  cancelRate: number;
  rejectedOrderCount: number;
  averageFeePerFill: number;
  averageSlippage?: number;
  averageSignalToOrderSeconds?: number;
  averageOrderToResolutionSeconds?: number;
  cashDrag: number;
  unusedAllocation: number;
  maxCapitalDeployed: number;
  resolvedMarkets: number;
  averagePnlPerResolvedMarket: number;
  maxIntradayDrawdown: number;
  worstMarket?: string;
  worstMarketPnl: number;
  worstFiveMinuteWindow: number;
  worstFifteenMinuteWindow: number;
  worstOneHourWindow: number;
  pnlVolatility: number;
  downsideDeviation: number;
  expectancyPerTrade: number;
  averageWin: number;
  averageLoss: number;
  winLossRatio: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  exposureByAsset: BreakdownItem[];
  pnlByWallet: BreakdownItem[];
  pnlByConfig: BreakdownItem[];
  pnlByAllocationMode: BreakdownItem[];
  pnlByMarketType: BreakdownItem[];
  pnlByAsset: BreakdownItem[];
  pnlByTimeOfDay: BreakdownItem[];
  pnlByLiquidityBucket: BreakdownItem[];
  pnlBySourcePositionSize: BreakdownItem[];
  pnlBySignalStrength: BreakdownItem[];
  pnlByConfidenceScore: BreakdownItem[];
  dataQuality: DataQualityMetrics;
  activeDeployments: number;
  activeContainers: number;
  lastTradeAt?: string;
  sessionCount: number;
  pnlSeries: PnlPoint[];
};

export type BreakdownItem = {
  label: string;
  value: number;
  count: number;
};

export type DataQualityMetrics = {
  missingMarketResolutions: number;
  eventsWithoutSessionId: number;
  eventsWithoutSourceWallet: number;
  eventsWithoutConfigSnapshot: number;
  duplicateOrderIds: number;
  duplicateEventRows: number;
  nullNetCashDelta: number;
  inconsistentMarketTitles: number;
  staleContainers: number;
  eventsFromUnknownDeployments: number;
};

export type SessionSummary = DeploymentSummary & {
  deploymentId?: string;
  deploymentKey?: string;
  sessionId: string;
  polymarketWalletUrl?: string;
  sizing?: PortfolioSizingSnapshot;
  configSnapshot?: Record<string, unknown>;
  marketPositions: MarketPositionSummary[];
};

export type MarketPositionSummary = {
  key: string;
  market: string;
  outcome?: string;
  asset?: string;
  conditionId?: string;
  polymarketUrl?: string;
  marketType?: string;
  liquidity?: number;
  sourcePositionSize?: number;
  signalStrength?: number;
  confidenceScore?: number;
  boughtShares: number;
  buyCost: number;
  averageBuyPrice: number;
  soldShares: number;
  sellProceeds: number;
  averageSellPrice: number;
  openShares: number;
  realizedPnl: number;
  fees: number;
  fillCount: number;
  resolved: boolean;
  firstTradeAt?: string;
  lastTradeAt?: string;
};

export type PortfolioSizingSnapshot = {
  computedPct: number;
  configuredPct?: number;
  percentile?: number;
  percentileValue?: number;
  riskFraction?: number;
  riskBudget?: number;
  cycleCap?: number;
  bankroll?: number;
  sampleCount?: number;
  source: string;
  formula?: string;
  summary?: {
    average?: number;
    median?: number;
    stdev?: number;
    minimum?: number;
    p75?: number;
    p90?: number;
    p95?: number;
    p99?: number;
    maximum?: number;
  };
  distribution?: {
    bins: Array<{ x0: number; x1: number; count: number }>;
    normalFit: Array<{ x: number; density: number }>;
    maxCount?: number;
    maxDensity?: number;
  };
};

export type PnlPoint = {
  when: string;
  value: number;
  delta: number;
  price?: number;
  market?: string;
  action?: string;
};

export type ComparisonPnlPoint = {
  when: string;
  ours: number;
  source: number;
};

export type PositionVerdict =
  | "matched"
  | "partial"
  | "overfilled"
  | "missed"
  | "wrong-outcome"
  | "source-only"
  | "unsupported";

export type PositionReconciliation = {
  key: string;
  conditionId: string;
  asset?: string;
  market: string;
  outcome?: string;
  ourCurrentShares: number;
  sourceCurrentShares: number;
  expectedShares: number;
  requestedShares: number;
  filledShares: number;
  sourceSignalShares?: number;
  sourcePeakShares?: number;
  portfolioSizingPct?: number;
  proportionalTargetShares?: number;
  ourBoughtShares: number;
  ourPeakShares: number;
  enteredAt?: string;
  fillPercent?: number;
  entryLagSeconds?: number;
  exitLagSeconds?: number;
  sourceEntryPrice?: number;
  ourEntryPrice?: number;
  sourceExitPrice?: number;
  ourExitPrice?: number;
  sourceExitType?: string;
  entryPriceDelta?: number;
  exitPriceDelta?: number;
  entryDelayPnl?: number;
  exitDelayPnl?: number;
  historyDivergencePercent?: number;
  ourPnl: number;
  sourcePnl?: number;
  pnlGap?: number;
  ourBuyCapital?: number;
  sourceBuyCapital?: number;
  ourFees?: number;
  ourTradeReturnPct?: number;
  sourceTradeReturnPct?: number;
  ourReturnContributionPct?: number;
  sourceReturnContributionPct?: number;
  returnGapContributionPct?: number;
  cumulativeOurReturnPct?: number;
  cumulativeSourceReturnPct?: number;

  targetDollars?: number;
  targetShares?: number;
  ourTargetPct?: number;
  entryLagMs?: number;
  exitLagMs?: number;
  ourReturnPct?: number;
  sourceCashPnl?: number;
  sourceRealizedPnl?: number;
  sourceReturnPct?: number;
  pnlGapPct?: number;
  sourceSeenAt?: number;
  sourcePositionValue?: number;
  sourceAvgPrice?: number;
  ourHeldBefore?: number;
  ourHeldAfter?: number;
  ourFillPrice?: number;
  ourFillTime?: string;
  sizingErrorPct?: number;

  verdict: PositionVerdict;
  notes: string[];
};

export type AlphaGapFactor = {
  label: string;
  impact: number;
  detail: string;
  unit?: "usd" | "pp";
};

export type ComparisonSummary = {
  matchedPositions: number;
  sourceOnlyPositions: number;
  wrongOutcomePositions: number;
  correctSizePositions: number;
  partialFillPositions: number;
  medianEntryLagSeconds?: number;
  medianExitLagSeconds?: number;
  ourPnl: number;
  sourcePnl: number;
  pnlGap: number;
  ourReturnPct?: number;
  sourceReturnPct?: number;
  pnlGapPct?: number;
  ourGrossBuyCapital: number;
  sourceGrossBuyCapital: number;
  ourAttributionResidual: number;
  sourceAttributionResidual: number;
  factors: AlphaGapFactor[];
};

export type SessionComparison = {
  sessionId: string;
  sourceWallet: string;
  startedAt: string;
  endedAt: string;
  updatedAt: string;
  sourceScope: "matched" | "wallet";
  unit: "usd" | "percent";
  series: ComparisonPnlPoint[];
  realizedSeries: ComparisonPnlPoint[];
  positions: PositionReconciliation[];
  summary: ComparisonSummary;
  warnings: string[];
  truncated: boolean;
  error?: string;
};

export type RecentEvidence = {
  id: string;
  when: string;
  mode: "paper" | "live";
  deploymentId: string;
  sessionId: string;
  strategy: string;
  market: string;
  wallet: string;
  action: string;
  status: string;
  netPnl: number;
  fee: number;
};

export type FilterOptions = {
  strategies: string[];
  deployments: Array<{ label: string; value: string }>;
  instances: string[];
  sessions: string[];
  categories: string[];
  assets: string[];
};

export type DashboardData = {
  appName: string;
  isConfigured: boolean;
  error?: string;
  kpis: Kpi[];
  warnings: string[];
  deployments: DeploymentSummary[];
  sessions: SessionSummary[];
  wallets: WalletSummary[];
  strategies: StrategySummary[];
  evidence: RecentEvidence[];
  filters: FilterOptions;
  updatedAt: string;
};
