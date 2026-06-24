import { getPrisma } from "@/lib/prisma";
import type {
  DashboardData,
  DashboardFilters,
  RecentEvidence,
  StrategySummary,
  WalletSummary
} from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

type SignalWallet = {
  wallet?: string;
  size?: number;
  outcome?: string;
  avg_price?: number;
  suspicion_score?: number;
};

type TradeRow = {
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
  topInsiderSize: number | null;
  market: {
    question: string;
    category: string | null;
    deltaT: string | null;
  } | null;
};

type EventRow = {
  id: bigint;
  createdAt: Date;
  eventType: string;
  status: string;
  reason: string | null;
  strategyName: string;
  allocationMode: string | null;
  paperMode: boolean;
  sessionId: string | null;
  instanceName: string | null;
  marketTitle: string | null;
  sourceWallet: string | null;
  sourcePositionSize: number | null;
  signalWalletsJson: string | null;
  fee: number | null;
  netCashDelta: number | null;
  grossCash: number | null;
};

function parseNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "NA") return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function withinDate(value: Date | string | null, start?: Date, end?: Date) {
  if (!start && !end) return true;
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return true;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function addWinLoss(target: { wins: number; losses: number }, pnl: number) {
  if (pnl > 0) target.wins += 1;
  if (pnl < 0) target.losses += 1;
}

function winRate(wins: number, losses: number) {
  const total = wins + losses;
  return total === 0 ? 0 : (wins / total) * 100;
}

function categoryOf(trade: TradeRow) {
  return trade.market?.category ?? trade.market?.deltaT ?? "uncategorized";
}

function modeMatches(mode: string | undefined, paperMode: boolean) {
  if (!mode || mode === "all") return true;
  return mode === (paperMode ? "paper" : "live");
}

function optionList(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort();
}

function summarizeWalletSource(wallets: SignalWallet[], sourceWallet?: string | null) {
  if (sourceWallet) return [{ wallet: sourceWallet, size: 1 }];
  return wallets.length > 0 ? wallets : [{ wallet: "Unknown", size: 1 }];
}

export async function getDashboardData(
  filters: DashboardFilters
): Promise<DashboardData> {
  const appName =
    process.env.NEXT_PUBLIC_APP_NAME ?? "Wallet Performance Analytics";

  if (!process.env.DATABASE_URL) {
    return emptyDashboard(appName, "Add DATABASE_URL to connect the Neon database.");
  }

  const prisma = getPrisma();

  const start = parseDate(filters.start);
  const end = parseDate(filters.end);

  try {
    const [events, liveTrades, paperTrades] = await Promise.all([
      prisma.tradeAnalyticsEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000
      }) as Promise<EventRow[]>,
      prisma.trade.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2500,
        include: { market: true }
      }) as Promise<TradeRow[]>,
      prisma.paperTrade.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2500,
        include: { market: true }
      }) as Promise<TradeRow[]>
    ]);

    const filteredEvents = events.filter((event) => {
      if (!modeMatches(filters.mode, event.paperMode)) return false;
      if (filters.strategy && filters.strategy !== "all" && event.strategyName !== filters.strategy) return false;
      if (filters.instance && filters.instance !== "all" && event.instanceName !== filters.instance) return false;
      if (filters.session && filters.session !== "all" && event.sessionId !== filters.session) return false;
      if (filters.wallet && !`${event.sourceWallet ?? ""} ${event.signalWalletsJson ?? ""}`.toLowerCase().includes(filters.wallet.toLowerCase())) return false;
      return withinDate(event.createdAt, start, end);
    });

    const allTrades = [
      ...liveTrades.map((trade) => ({ ...trade, paperMode: false })),
      ...paperTrades.map((trade) => ({ ...trade, paperMode: true }))
    ].filter((trade) => {
      if (!modeMatches(filters.mode, trade.paperMode)) return false;
      if (filters.instance && filters.instance !== "all" && trade.instanceName !== filters.instance) return false;
      if (filters.session && filters.session !== "all" && trade.sessionId !== filters.session) return false;
      if (filters.category && filters.category !== "all" && categoryOf(trade) !== filters.category) return false;
      if (filters.wallet && !`${trade.topInsiderWallet ?? ""} ${trade.signalWalletsJson ?? ""}`.toLowerCase().includes(filters.wallet.toLowerCase())) return false;
      return withinDate(trade.createdAt ?? trade.timestamp, start, end);
    });

    const walletMap = new Map<string, WalletSummary>();
    const strategyMap = new Map<string, StrategySummary>();
    const activeSessions = new Set<string>();
    let netPnl = 0;
    let fees = 0;
    let wins = 0;
    let losses = 0;

    for (const event of filteredEvents) {
      const pnl = parseNumber(event.netCashDelta);
      const fee = Math.abs(parseNumber(event.fee));
      const strategyKey = [
        event.strategyName,
        event.allocationMode ?? "default",
        event.instanceName ?? "default",
        event.paperMode ? "paper" : "live"
      ].join("::");

      netPnl += pnl;
      fees += fee;
      if (event.sessionId) activeSessions.add(event.sessionId);
      if (pnl > 0) wins += 1;
      if (pnl < 0) losses += 1;

      const strategy =
        strategyMap.get(strategyKey) ??
        {
          strategy: event.strategyName,
          allocationMode: event.allocationMode ?? "default",
          instanceName: event.instanceName ?? "default",
          mode: event.paperMode ? "paper" : "live",
          netPnl: 0,
          fees: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          skipped: 0
        };

      strategy.netPnl += pnl;
      strategy.fees += fee;
      strategy.trades += event.status === "skipped" ? 0 : 1;
      strategy.skipped += event.status === "skipped" ? 1 : 0;
      addWinLoss(strategy, pnl);
      strategy.winRate = winRate(strategy.wins, strategy.losses);
      strategyMap.set(strategyKey, strategy);

      const sourceWallets = summarizeWalletSource(
        parseWallets(event.signalWalletsJson),
        event.sourceWallet
      );
      for (const source of sourceWallets) {
        const wallet = source.wallet ?? "Unknown";
        const summary = walletMap.get(wallet) ?? createWalletSummary(wallet, "event");
        summary.netPnl += pnl / sourceWallets.length;
        summary.grossPnl += parseNumber(event.grossCash) / sourceWallets.length;
        summary.fees += fee / sourceWallets.length;
        summary.trades += 1;
        summary.averagePositionSize += parseNumber(source.size ?? event.sourcePositionSize);
        addWinLoss(summary, pnl);
        summary.winRate = winRate(summary.wins, summary.losses);
        summary.bestStrategy = bestStrategyName(summary.bestStrategy, event.strategyName, summary.netPnl);
        walletMap.set(wallet, summary);
      }
    }

    for (const trade of allTrades) {
      const pnl = parseNumber(trade.pnl);
      const sourceWallets = summarizeWalletSource(
        parseWallets(trade.signalWalletsJson),
        trade.topInsiderWallet
      );
      netPnl += pnl;
      if (trade.sessionId) activeSessions.add(trade.sessionId);
      if (pnl > 0) wins += 1;
      if (pnl < 0) losses += 1;

      for (const source of sourceWallets) {
        const wallet = source.wallet ?? "Unknown";
        const summary =
          walletMap.get(wallet) ??
          createWalletSummary(
            wallet,
            trade.topInsiderWallet ? "top-insider" : "signal"
          );
        summary.netPnl += pnl / sourceWallets.length;
        summary.grossPnl += pnl / sourceWallets.length;
        summary.trades += 1;
        summary.averagePositionSize += parseNumber(source.size ?? trade.topInsiderSize ?? trade.pos);
        addWinLoss(summary, pnl);
        summary.winRate = winRate(summary.wins, summary.losses);
        walletMap.set(wallet, summary);
      }
    }

    const wallets = Array.from(walletMap.values())
      .map((wallet) => ({
        ...wallet,
        averagePositionSize:
          wallet.trades === 0 ? 0 : wallet.averagePositionSize / wallet.trades,
        compatibility:
          wallet.netPnl > 0
            ? "candidate"
            : wallet.netPnl < 0
              ? "review"
              : "neutral"
      }))
      .sort((a, b) => b.netPnl - a.netPnl)
      .slice(0, 50);

    const strategies = Array.from(strategyMap.values()).sort(
      (a, b) => b.netPnl - a.netPnl
    );

    const evidence = buildEvidence(filteredEvents, allTrades);
    const totalClosed = wins + losses;

    return {
      appName,
      isConfigured: true,
      kpis: [
        {
          label: "Net PnL",
          value: formatCurrency(netPnl),
          detail: `${totalClosed} closed signal outcomes`,
          tone: netPnl > 0 ? "profit" : netPnl < 0 ? "loss" : "neutral"
        },
        {
          label: "Fees",
          value: formatCurrency(-fees),
          detail: "cash drag from analytics events",
          tone: fees > 0 ? "caution" : "neutral"
        },
        {
          label: "Win Rate",
          value: formatPercent(winRate(wins, losses)),
          detail: `${wins} wins / ${losses} losses`,
          tone: winRate(wins, losses) >= 50 ? "profit" : "loss"
        },
        {
          label: "Wallets",
          value: wallets.length.toString(),
          detail: "attributed signal wallets",
          tone: "neutral"
        },
        {
          label: "Strategies",
          value: strategies.length.toString(),
          detail: "strategy/allocation groups",
          tone: "neutral"
        },
        {
          label: "Sessions",
          value: activeSessions.size.toString(),
          detail: "active in current filters",
          tone: "neutral"
        }
      ],
      wallets,
      strategies,
      evidence,
      filters: {
        strategies: optionList(filteredEvents.map((event) => event.strategyName)),
        instances: optionList([
          ...filteredEvents.map((event) => event.instanceName),
          ...paperTrades.map((trade) => trade.instanceName)
        ]),
        sessions: optionList([
          ...filteredEvents.map((event) => event.sessionId),
          ...allTrades.map((trade) => trade.sessionId)
        ]),
        categories: optionList(allTrades.map((trade) => categoryOf(trade)))
      },
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return emptyDashboard(
      appName,
      error instanceof Error ? error.message : "Unable to read analytics data."
    );
  }
}

function createWalletSummary(
  wallet: string,
  source: WalletSummary["source"]
): WalletSummary {
  return {
    wallet,
    netPnl: 0,
    grossPnl: 0,
    fees: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    averagePositionSize: 0,
    bestStrategy: "mixed",
    compatibility: "neutral",
    source
  };
}

function bestStrategyName(current: string, candidate: string, pnl: number) {
  if (current === "mixed" && pnl > 0) return candidate;
  return current;
}

function buildEvidence(
  events: EventRow[],
  trades: Array<TradeRow & { paperMode: boolean }>
): RecentEvidence[] {
  const eventEvidence: RecentEvidence[] = events.slice(0, 30).map((event) => ({
    id: `event-${event.id.toString()}`,
    when: event.createdAt.toISOString(),
    mode: event.paperMode ? "paper" : "live",
    strategy: event.strategyName,
    market: event.marketTitle ?? "Unknown market",
    wallet: event.sourceWallet ?? firstWallet(parseWallets(event.signalWalletsJson)),
    action: event.eventType,
    status: event.status,
    netPnl: parseNumber(event.netCashDelta),
    fee: Math.abs(parseNumber(event.fee))
  }));

    const tradeEvidence: RecentEvidence[] = trades.slice(0, 30).map((trade) => ({
    id: `trade-${trade.paperMode ? "paper" : "live"}-${trade.id.toString()}`,
    when: (trade.createdAt ?? new Date(trade.timestamp)).toISOString(),
    mode: trade.paperMode ? "paper" : "live",
    strategy: trade.paperMode ? "paper_trades" : "trades",
    market: trade.market?.question ?? trade.marketId,
    wallet: trade.topInsiderWallet ?? firstWallet(parseWallets(trade.signalWalletsJson)),
    action: trade.action,
    status: trade.verified ? "verified" : "recorded",
    netPnl: parseNumber(trade.pnl),
    fee: 0
  }));

  return [...eventEvidence, ...tradeEvidence]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, 40);
}

function firstWallet(wallets: SignalWallet[]) {
  return wallets[0]?.wallet ?? "Unknown";
}

function emptyDashboard(appName: string, error: string): DashboardData {
  return {
    appName,
    isConfigured: false,
    error,
    kpis: [
      {
        label: "Net PnL",
        value: "$0.00",
        detail: "waiting for database",
        tone: "neutral"
      },
      {
        label: "Fees",
        value: "$0.00",
        detail: "waiting for analytics events",
        tone: "neutral"
      },
      {
        label: "Win Rate",
        value: "0.0%",
        detail: "no closed trades loaded",
        tone: "neutral"
      }
    ],
    wallets: [],
    strategies: [],
    evidence: [],
    filters: {
      strategies: [],
      instances: [],
      sessions: [],
      categories: []
    },
    updatedAt: new Date().toISOString()
  };
}
