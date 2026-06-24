export type DashboardFilters = {
  mode?: string;
  strategy?: string;
  instance?: string;
  session?: string;
  category?: string;
  wallet?: string;
  start?: string;
  end?: string;
};

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

export type RecentEvidence = {
  id: string;
  when: string;
  mode: "paper" | "live";
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
  instances: string[];
  sessions: string[];
  categories: string[];
};

export type DashboardData = {
  appName: string;
  isConfigured: boolean;
  error?: string;
  kpis: Kpi[];
  wallets: WalletSummary[];
  strategies: StrategySummary[];
  evidence: RecentEvidence[];
  filters: FilterOptions;
  updatedAt: string;
};
