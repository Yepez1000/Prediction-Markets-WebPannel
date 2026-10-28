"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tab = "statistics" | "positions" | "active" | "trades" | "comparison";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "statistics", label: "Market statistics" },
  { id: "active", label: "Active positions" },
  { id: "positions", label: "Market positions" },
  { id: "trades", label: "Placed trades" },
  { id: "comparison", label: "Wallet comparison" }
];

export function SessionTabs({ marketStatistics, marketPositions, activePositions, placedTrades, walletComparison }: { marketStatistics: ReactNode; marketPositions: ReactNode; activePositions: ReactNode; placedTrades: ReactNode; walletComparison?: ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>("statistics");
  const panels: Record<Tab, ReactNode> = {
    statistics: marketStatistics,
    positions: marketPositions,
    active: activePositions,
    trades: placedTrades,
    comparison: walletComparison ?? <EmptyComparison />
  };

  return <section className="min-w-0"><div className="mb-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Session detail views">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn("shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors", activeTab === tab.id ? "border-primary text-[#a5b4fc]" : "border-transparent text-muted-foreground hover:text-foreground")}>{tab.label}</button>)}</div><div role="tabpanel">{panels[activeTab]}</div></section>;
}

function EmptyComparison() {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Wallet comparison is unavailable for this session.</div>;
}
