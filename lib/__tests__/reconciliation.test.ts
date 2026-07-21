import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  reconcileSession,
  reconciliationCacheMaxAgeMs,
  type ComparisonEvent
} from "@/lib/reconciliation";
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
  it("uses a short cache for active sessions and a day-long cache once ended", () => {
    expect(reconciliationCacheMaxAgeMs({ endedAt: null, status: "active" })).toBe(60_000);
    expect(reconciliationCacheMaxAgeMs({ endedAt: null, status: "stopped" })).toBe(86_400_000);
    expect(reconciliationCacheMaxAgeMs({ endedAt: new Date(), status: "active" })).toBe(86_400_000);
  });

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
    expect(row.ourTradeReturnPct).toBeCloseTo(0);
    expect(row.sourceReturnContributionPct).toBeCloseTo(40);
    expect(row.ourReturnContributionPct).toBeCloseTo(0);
    expect(row.cumulativeSourceReturnPct).toBeCloseTo(40);
    expect(row.cumulativeOurReturnPct).toBeCloseTo(0);
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

  it("averages signal-to-order seconds across buy fills for one asset", () => {
    const first = event({
      createdAt: new Date("2026-06-26T10:00:10Z"),
      contextJson: JSON.stringify({ signal_to_order_seconds: 10, target_local_shares: 10 })
    });
    const second = event({
      createdAt: new Date("2026-06-26T10:00:20Z"),
      filledShares: 5,
      heldAfter: 15,
      contextJson: JSON.stringify({ signal_to_order_seconds: 20, target_local_shares: 15 })
    });
    const result = reconcile({ events: [first, second] });

    expect(result.positions[0].entryLagSeconds).toBe(15);
    expect(result.positions[0].entryLagMs).toBe(15_000);
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

  it("detects source-only positions from activity even when position endpoints omit them", () => {
    const oppositeAsset = "999";
    const result = reconcile({
      activity: [
        sourceActivity(),
        sourceActivity({ asset: oppositeAsset, outcome: "Down", transactionHash: "0x2", size: 20, usdcSize: 8, price: 0.4 })
      ],
      currentPositions: [position()],
      closedPositions: [],
      prices: new Map([
        [asset, [{ t: new Date("2026-06-26T10:05:00Z").getTime() / 1000, p: 0.7 }]],
        [oppositeAsset, [{ t: new Date("2026-06-26T10:05:00Z").getTime() / 1000, p: 0.6 }]]
      ])
    });
    const row = result.positions.find((position) => position.asset === oppositeAsset);

    expect(row?.verdict).toBe("source-only");
    expect(row?.sourceCurrentShares).toBe(20);
    expect(row?.sourceBuyCapital).toBe(8);
    expect(row?.sourcePnl).toBeCloseTo(4);
    expect(result.summary.sourceGrossBuyCapital).toBe(58);
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

  it("includes source redemptions and settled losses in the realized graph", () => {
    const assetA = "asset-a";
    const assetB = "asset-b";
    const assetC = "asset-c";
    const at = (value: string) => new Date(value).getTime() / 1000;
    const result = reconcile({
      events: [event({ clobTokenId: assetA, filledShares: 1, requestedShares: 1, grossCash: 0.01, price: 0.01, heldAfter: 1 })],
      activity: [
        sourceActivity({ asset: assetA, outcome: "A", timestamp: at("2026-06-26T10:00:00Z"), size: 1, usdcSize: 0.01, price: 0.01, transactionHash: "0xa-buy" }),
        sourceActivity({ asset: assetA, outcome: "A", timestamp: at("2026-06-26T10:01:00Z"), type: "REDEEM", side: "", size: 1, usdcSize: 0, price: 1, transactionHash: "0xa-redeem" }),
        sourceActivity({ asset: assetB, outcome: "B", timestamp: at("2026-06-26T10:02:00Z"), size: 1, usdcSize: 0.57, price: 0.57, transactionHash: "0xb-buy" }),
        sourceActivity({ asset: assetB, outcome: "B", timestamp: at("2026-06-26T10:03:00Z"), type: "REDEEM", side: "", size: 1, usdcSize: 0, price: 1, transactionHash: "0xb-redeem" }),
        sourceActivity({ asset: assetC, outcome: "C", timestamp: at("2026-06-26T10:04:00Z"), size: 1, usdcSize: 0.99, price: 0.99, transactionHash: "0xc-buy" }),
        sourceActivity({ asset: assetC, outcome: "C", timestamp: at("2026-06-26T10:05:00Z"), type: "REDEEM", side: "", size: 1, usdcSize: 0, price: 0, transactionHash: "0xc-redeem" })
      ],
      currentPositions: [],
      closedPositions: [],
      resolutions: new Map([[conditionId, resolution({
        tokens: [
          { tokenId: assetA, outcome: "A", price: 1, winner: true },
          { tokenId: assetB, outcome: "B", price: 1, winner: true },
          { tokenId: assetC, outcome: "C", price: 0, winner: false }
        ]
      })]])
    });

    expect(result.realizedSeries.some((point) => Math.abs(point.source - 1.42) < 1e-9)).toBe(true);
    expect(result.realizedSeries.at(-1)!.source).toBeCloseTo(0.43);
  });

  it("uses reconstructed local averages and realized PnL for our row result", () => {
    const secondBuy = event({
      createdAt: new Date("2026-06-26T10:01:00Z"),
      price: 0.65,
      grossCash: 6.5,
      heldAfter: 20
    });
    const firstSell = event({
      createdAt: new Date("2026-06-26T10:05:00Z"),
      side: "SELL",
      price: 0.7,
      grossCash: 3.5,
      filledShares: 5,
      heldAfter: 15
    });
    const secondSell = event({
      createdAt: new Date("2026-06-26T10:06:00Z"),
      side: "SELL",
      price: 0.9,
      grossCash: 13.5,
      filledShares: 15,
      heldAfter: 0
    });
    const result = reconcile({
      events: [event(), secondBuy, firstSell, secondSell],
      currentPositions: [],
      closedPositions: [position({ size: 0 })]
    });
    const row = result.positions[0];

    expect(row.ourEntryPrice).toBeCloseTo(0.6);
    expect(row.ourExitPrice).toBeCloseTo(0.85);
    expect(row.ourPnl).toBeCloseTo(5);
    expect(row.ourTradeReturnPct).toBeCloseTo(41.6667);
  });

  it("keeps local average entry and exit prices gross of fees", () => {
    const buy = event({ price: 0.5, grossCash: 5, fee: 0.2 });
    const sell = event({
      createdAt: new Date("2026-06-26T10:05:00Z"),
      side: "SELL",
      price: 0.7,
      grossCash: 7,
      fee: 0.3,
      heldAfter: 0
    });
    const result = reconcile({
      events: [buy, sell],
      currentPositions: [],
      closedPositions: [position({ size: 0 })]
    });
    const row = result.positions[0];

    expect(row.ourEntryPrice).toBeCloseTo(0.5);
    expect(row.ourExitPrice).toBeCloseTo(0.7);
    expect(row.ourFees).toBeCloseTo(0.5);
    expect(row.ourPnl).toBeCloseTo(1.5);
  });

  it("reconciles fractional FAK fills as local positions", () => {
    const result = reconcile({
      events: [event({ eventType: "fractional_fak_fill" })]
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].ourEntryPrice).toBeCloseTo(0.55);
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
