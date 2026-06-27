import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reconcileSession, type ComparisonEvent } from "@/lib/reconciliation";
import type { PolymarketActivity, PolymarketPosition } from "@/lib/polymarket";

const wallet = "0x927f7694de44d19a72bce76254e628d1c141d215";
const conditionId = "0x70514533210407ffc139eda8b0b459ef19a22f638322f1ee759c731d58a6aac8";
const asset = "48975605337221251206342465976732916492982689283052111377493556265930059643413";

function event(overrides: Partial<ComparisonEvent> = {}): ComparisonEvent {
  return {
    createdAt: new Date("2026-06-26T10:00:10Z"),
    eventType: "order_fill",
    status: "FILLED",
    conditionId,
    clobTokenId: asset,
    marketTitle: "Bitcoin up or down",
    outcome: "Up",
    side: "BUY",
    requestedShares: 10,
    filledShares: 10,
    price: 0.55,
    grossCash: 5.5,
    fee: 0,
    targetShares: 10,
    heldAfter: 10,
    sourcePositionSize: 100,
    contextJson: JSON.stringify({ signal_observed_at: "2026-06-26T10:00:00Z", signal_to_order_seconds: 10, target_local_shares: 10 }),
    ...overrides
  };
}

function sourceActivity(overrides: Partial<PolymarketActivity> = {}): PolymarketActivity {
  return {
    proxyWallet: wallet,
    timestamp: new Date("2026-06-26T10:00:00Z").getTime() / 1000,
    conditionId,
    type: "TRADE",
    size: 100,
    usdcSize: 50,
    transactionHash: "0x1",
    price: 0.5,
    asset,
    side: "BUY",
    outcomeIndex: 0,
    title: "Bitcoin up or down",
    slug: "btc",
    outcome: "Up",
    ...overrides
  };
}

function position(overrides: Partial<PolymarketPosition> = {}): PolymarketPosition {
  return {
    proxyWallet: wallet,
    asset,
    conditionId,
    size: 100,
    avgPrice: 0.5,
    initialValue: 50,
    currentValue: 70,
    cashPnl: 20,
    totalBought: 100,
    realizedPnl: 0,
    curPrice: 0.7,
    title: "Bitcoin up or down",
    slug: "btc",
    outcome: "Up",
    outcomeIndex: 0,
    ...overrides
  };
}

function reconcile(overrides: Partial<Parameters<typeof reconcileSession>[0]> = {}) {
  return reconcileSession({
    sessionId: "session",
    sourceWallet: wallet,
    startedAt: new Date("2026-06-26T09:59:00Z"),
    endedAt: new Date("2026-06-26T10:10:00Z"),
    events: [event()],
    activity: [sourceActivity()],
    currentPositions: [position()],
    closedPositions: [],
    nativePnl: [],
    prices: new Map([[asset, [{ t: new Date("2026-06-26T10:05:00Z").getTime() / 1000, p: 0.7 }]]]),
    sourceScope: "matched",
    unit: "usd",
    ...overrides
  });
}

describe("session reconciliation", () => {
  it("matches condition and asset and measures entry lag and slippage", () => {
    const result = reconcile();
    const row = result.positions[0];
    expect(row.verdict).toBe("matched");
    expect(row.fillPercent).toBe(100);
    expect(row.entryLagSeconds).toBe(10);
    expect(row.entryPriceDifference).toBeCloseTo(0.05);
    expect(result.series[0]).toMatchObject({ ours: 0, source: 0 });
  });

  it("marks a partial fill against the requested local size", () => {
    const result = reconcile({ events: [event({ filledShares: 4, heldAfter: 4 })] });
    expect(result.positions[0].verdict).toBe("partial");
    expect(result.positions[0].fillPercent).toBe(40);
  });

  it("flags a wrong outcome when no source token can be matched", () => {
    const result = reconcile({ activity: [], currentPositions: [], closedPositions: [] });
    expect(result.positions[0].verdict).toBe("wrong-outcome");
  });

  it("detects source-only positions in a followed condition", () => {
    const oppositeAsset = "999";
    const result = reconcile({
      activity: [sourceActivity(), sourceActivity({ asset: oppositeAsset, outcome: "Down", transactionHash: "0x2" })],
      currentPositions: [position(), position({ asset: oppositeAsset, outcome: "Down", size: 20 })]
    });
    expect(result.positions.some((row) => row.verdict === "source-only")).toBe(true);
  });

  it("keeps mark-to-market output finite when price history is missing", () => {
    const result = reconcile({ prices: new Map() });
    expect(result.series.every((point) => Number.isFinite(point.ours))).toBe(true);
  });

  it("reports exits and realized PnL", () => {
    const sell = event({ createdAt: new Date("2026-06-26T10:05:15Z"), side: "SELL", price: 0.8, grossCash: 8, heldAfter: 0 });
    const result = reconcile({
      events: [event(), sell],
      activity: [sourceActivity(), sourceActivity({ timestamp: new Date("2026-06-26T10:05:00Z").getTime() / 1000, side: "SELL", price: 0.75, usdcSize: 75, transactionHash: "0x3" })],
      currentPositions: [],
      closedPositions: [position({ size: 0, realizedPnl: 25 })]
    });
    expect(result.positions[0].exitLagSeconds).toBe(15);
    expect(result.realizedSeries.at(-1)!.ours).toBeCloseTo(2.5);
  });
});
