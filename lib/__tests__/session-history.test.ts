import { describe, expect, it } from "vitest";

import { SESSION_EVENT_PAGE_SIZE, sessionHistoryScope } from "@/lib/session-history";

describe("sessionHistoryScope", () => {
  it("loads the first page by default", () => {
    expect(sessionHistoryScope({})).toEqual({
      limit: SESSION_EVENT_PAGE_SIZE,
      isFull: false
    });
  });

  it("increases the cumulative history limit by page", () => {
    expect(sessionHistoryScope({ tradePage: "3" })).toEqual({
      limit: SESSION_EVENT_PAGE_SIZE * 3,
      isFull: false
    });
  });

  it("uses an explicit trade limit over page-based loading", () => {
    expect(sessionHistoryScope({ tradePage: "3", tradeLimit: "275" })).toEqual({
      limit: 275,
      isFull: false
    });
  });

  it("removes the limit only when whole history is requested", () => {
    expect(sessionHistoryScope({ history: "all", tradePage: "3" })).toEqual({
      isFull: true
    });
  });
});
