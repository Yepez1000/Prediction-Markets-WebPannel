import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reconcileSession, type ComparisonEvent } from "@/lib/reconciliation";
import type { PolymarketActivity, PolymarketMarketResolution, PolymarketPosition } from "@/lib/polymarket";

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

function resolution(overrides: Partial<PolymarketMarketResolution> = {}): PolymarketMarketResolution {
  return {
    conditionId,
    question: "Bitcoin up or down",
    closed: true,
    active: false,
    archived: false,
    tokens: [
      { tokenId: asset, outcome: "Up", price: 1, winner: true },
      { tokenId: "other", outcome: "Down", price: 0, winner: false }
    ],
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
    portfolioSizingPct: 0.1,
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
    expect(row.sourceEntryPrice).toBe(0.5);
    expect(row.ourEntryPrice).toBe(0.55);
    expect(row.entryPriceDelta).toBeCloseTo(0.05);
    expect(row.entryDelayPnl).toBeCloseTo(-0.5);
    expect(row.sourceSignalShares).toBe(100);
    expect(row.proportionalTargetShares).toBe(10);
    expect(row.ourBoughtShares).toBe(10);
    expect(row.ourPeakShares).toBe(10);
    expect(row.sourceTradeReturnPct).toBeCloseTo(40);
    expect(row.ourTradeReturnPct).toBeCloseTo(27.2727);
    expect(row.sourceReturnContributionPct).toBeCloseTo(40);
    expect(row.ourReturnContributionPct).toBeCloseTo(27.2727);
    expect(row.cumulativeSourceReturnPct).toBeCloseTo(40);
    expect(row.cumulativeOurReturnPct).toBeCloseTo(27.2727);
    expect(result.summary.sourceGrossBuyCapital).toBe(50);
    expect(result.summary.ourGrossBuyCapital).toBe(5.5);
    expect(result.summary.sourceAttributionResidual).toBeCloseTo(0);
    expect(result.summary.ourAttributionResidual).toBeCloseTo(0);
    expect(result.series[0]).toMatchObject({ ours: 0, source: 0 });
  });

  it("uses execution metadata instead of a delayed analytics write time", () => {
    const delayed = event({
      createdAt: new Date("2026-06-26T10:08:00Z"),
      contextJson: JSON.stringify({
        signal_observed_at: "2026-06-26T10:00:00Z",
        source_event_to_fill_seconds: 9.75,
        analytics_enqueued_at: "2026-06-26T10:00:09.750Z",
        analytics_queue_wait_seconds: 470.25,
        target_local_shares: 10
      })
    });
    const result = reconcile({ events: [delayed] });

    expect(result.positions[0].entryLagSeconds).toBe(9.75);
    expect(result.positions[0].enteredAt).toBe("2026-06-26T10:00:09.750Z");
    expect(result.positions[0].ourFillTime).toBe("2026-06-26T10:00:09.750Z");
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
    expect(result.positions[0].exitLagSeconds).toBeUndefined();
    expect(result.positions[0].sourceExitPrice).toBe(0.75);
    expect(result.positions[0].ourExitPrice).toBe(0.8);
    expect(result.positions[0].exitPriceDelta).toBeCloseTo(0.05);
    expect(result.positions[0].exitDelayPnl).toBeCloseTo(0.5);
    expect(result.realizedSeries.at(-1)!.ours).toBeCloseTo(2.5);
  });

  it("uses market resolution when source positions are unavailable", () => {
    const result = reconcile({
      activity: [sourceActivity()],
      currentPositions: [],
      closedPositions: [],
      resolutions: new Map([[conditionId, resolution()]])
    });

    expect(result.positions[0].sourceExitPrice).toBe(1);
    expect(result.positions[0].sourceExitType).toBe("RESOLUTION");
  });

  it("computes average exit price across multiple source sells", () => {
    const sell = event({ createdAt: new Date("2026-06-26T10:05:15Z"), side: "SELL", price: 0.8, grossCash: 8, heldAfter: 0 });
    const result = reconcile({
      events: [event(), sell],
      activity: [
        sourceActivity(),
        sourceActivity({ timestamp: new Date("2026-06-26T10:04:00Z").getTime() / 1000, side: "SELL", price: 0.70, usdcSize: 35, transactionHash: "0x3", size: 50 }),
        sourceActivity({ timestamp: new Date("2026-06-26T10:05:00Z").getTime() / 1000, side: "SELL", price: 0.80, usdcSize: 40, transactionHash: "0x4", size: 50 })
      ],
      currentPositions: [],
      closedPositions: [position({ size: 0, realizedPnl: 25 })]
    });
    expect(result.positions[0].sourceExitPrice).toBeCloseTo(0.75);
    expect(result.positions[0].exitPriceDelta).toBeCloseTo(0.05);
    expect(result.positions[0].exitDelayPnl).toBeCloseTo(0.5);
  });

  it("reports a MERGE lifecycle offset without calling it execution lag", () => {
    const sell = event({
      createdAt: new Date("2026-06-26T10:05:15Z"),
      side: "SELL",
      price: 0,
      grossCash: 0,
      heldAfter: 0
    });
    const merge = sourceActivity({
      timestamp: new Date("2026-06-26T10:05:00Z").getTime() / 1000,
      type: "MERGE",
      side: "",
      price: 0,
      asset: "",
      outcome: "",
      transactionHash: "0x4"
    });
    const result = reconcile({
      events: [event(), sell],
      activity: [sourceActivity(), merge],
      currentPositions: [],
      closedPositions: [position({ size: 0 })]
    });

    expect(result.positions[0].exitLagSeconds).toBeUndefined();
    expect(result.positions[0].exitEventOffsetSeconds).toBeUndefined();
    expect(result.positions[0].sourceExitType).toBe("MERGE");
    expect(result.positions[0].sourceExitPrice).toBeUndefined();
    expect(result.positions[0].exitPriceDelta).toBeUndefined();
    expect(result.positions[0].exitDelayPnl).toBeUndefined();
  });
});
