import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMarketResolution, getWalletActivity } from "@/lib/polymarket";

const wallet = "0x927f7694de44d19a72bce76254e628d1c141d215";
const conditionId = "0x70514533210407ffc139eda8b0b459ef19a22f638322f1ee759c731d58a6aac8";

function activity(index: number) {
  return {
    proxyWallet: wallet,
    timestamp: 100 + index,
    conditionId,
    type: "TRADE",
    size: 2,
    usdcSize: 1,
    transactionHash: `0x${index}`,
    price: 0.5,
    asset: "123",
    side: "BUY",
    outcomeIndex: 0,
    title: "Market",
    slug: "market",
    outcome: "Yes"
  };
}

describe("Polymarket activity client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("paginates at 500 rows and validates response rows", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [...Array.from({ length: 500 }, (_, index) => activity(index)), { bad: true }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [activity(501)] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getWalletActivity({ user: wallet, start: 0, end: 1000, conditionIds: [conditionId] });

    expect(result.rows).toHaveLength(501);
    expect(result.truncated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=500");
  });

  it("rejects invalid wallet addresses before making a request", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(getWalletActivity({ user: "bad", start: 0, end: 1, conditionIds: [conditionId] }))
      .rejects.toThrow("Invalid source wallet");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses market resolution tokens from the CLOB endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        condition_id: conditionId,
        question: "Market",
        closed: true,
        active: false,
        archived: false,
        tokens: [
          { token_id: "111", outcome: "Yes", price: 1, winner: true },
          { token_id: "222", outcome: "No", price: 0, winner: false }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMarketResolution(conditionId);

    expect(result).toEqual({
      conditionId,
      question: "Market",
      closed: true,
      active: false,
      archived: false,
      tokens: [
        { tokenId: "111", outcome: "Yes", price: 1, winner: true },
        { tokenId: "222", outcome: "No", price: 0, winner: false }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/markets/${conditionId}`),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) })
    );
  });
});
