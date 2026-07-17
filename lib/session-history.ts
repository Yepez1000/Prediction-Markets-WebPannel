import type { DashboardFilters } from "@/lib/types";

export const SESSION_EVENT_PAGE_SIZE = 100;
const MAX_SESSION_EVENT_PAGES = 100;

export type SessionHistoryScope = {
  limit?: number;
  isFull: boolean;
};

export function sessionHistoryScope(filters: DashboardFilters): SessionHistoryScope {
  if (filters.history === "all") return { isFull: true };

  const requestedLimit = Number.parseInt(filters.tradeLimit ?? "", 10);
  if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
    return {
      limit: requestedLimit,
      isFull: false
    };
  }

  const page = Number.parseInt(filters.tradePage ?? "1", 10);
  const safePage = Number.isFinite(page)
    ? Math.min(Math.max(page, 1), MAX_SESSION_EVENT_PAGES)
    : 1;

  return { limit: safePage * SESSION_EVENT_PAGE_SIZE, isFull: false };
}
