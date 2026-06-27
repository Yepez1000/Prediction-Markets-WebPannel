import "server-only";

const DATA_API = "https://data-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";
const USER_PNL_API = "https://user-pnl-api.polymarket.com";
const PAGE_SIZE = 500;
const MAX_OFFSET = 10_000;

export type PolymarketActivity = {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: "TRADE" | "SPLIT" | "MERGE" | "REDEEM" | "REWARD" | "CONVERSION" | string;
  size: number;
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;
  side: "BUY" | "SELL" | "";
  outcomeIndex: number;
  title: string;
  slug: string;
  outcome: string;
  isCombo?: boolean;
};

export type PolymarketPosition = {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  title: string;
  slug: string;
  outcome: string;
  outcomeIndex: number;
};

export type PolymarketPnlPoint = { t: number; p: number };
export type PolymarketPricePoint = { t: number; p: number };

type PaginatedResult<T> = { rows: T[]; truncated: boolean };

function validWallet(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validCondition(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function readJson(
  url: string,
  init?: RequestInit & { next?: { revalidate?: number } }
) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Polymarket returned ${response.status}.`);
  return response.json() as Promise<unknown>;
}

function parseActivity(value: unknown): PolymarketActivity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const conditionId = text(row.conditionId);
    if (!validCondition(conditionId)) return [];
    return [{
      proxyWallet: text(row.proxyWallet),
      timestamp: finite(row.timestamp),
      conditionId,
      type: text(row.type),
      size: finite(row.size),
      usdcSize: finite(row.usdcSize),
      transactionHash: text(row.transactionHash),
      price: finite(row.price),
      asset: text(row.asset),
      side: text(row.side).toUpperCase() as PolymarketActivity["side"],
      outcomeIndex: finite(row.outcomeIndex),
      title: text(row.title),
      slug: text(row.slug),
      outcome: text(row.outcome),
      isCombo: row.isCombo === true
    }];
  });
}

function parsePositions(value: unknown): PolymarketPosition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const conditionId = text(row.conditionId);
    if (!validCondition(conditionId)) return [];
    return [{
      proxyWallet: text(row.proxyWallet),
      asset: text(row.asset),
      conditionId,
      size: finite(row.size),
      avgPrice: finite(row.avgPrice),
      initialValue: finite(row.initialValue),
      currentValue: finite(row.currentValue),
      cashPnl: finite(row.cashPnl),
      totalBought: finite(row.totalBought),
      realizedPnl: finite(row.realizedPnl),
      curPrice: finite(row.curPrice),
      title: text(row.title),
      slug: text(row.slug),
      outcome: text(row.outcome),
      outcomeIndex: finite(row.outcomeIndex)
    }];
  });
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function getWalletActivity(input: {
  user: string;
  start: number;
  end: number;
  conditionIds: string[];
}): Promise<PaginatedResult<PolymarketActivity>> {
  if (!validWallet(input.user)) throw new Error("Invalid source wallet address.");
  const markets = Array.from(new Set(input.conditionIds.filter(validCondition)));
  if (markets.length === 0) return { rows: [], truncated: false };
  const collected: PolymarketActivity[] = [];
  let truncated = false;

  for (const marketBatch of chunks(markets, 25)) {
    for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE_SIZE) {
      const params = new URLSearchParams({
        user: input.user,
        market: marketBatch.join(","),
        start: Math.floor(input.start).toString(),
        end: Math.floor(input.end).toString(),
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
        sortBy: "TIMESTAMP",
        sortDirection: "ASC"
      });
      const page = parseActivity(await readJson(`${DATA_API}/activity?${params}`));
      collected.push(...page);
      if (page.length < PAGE_SIZE) break;
      if (offset + PAGE_SIZE > MAX_OFFSET) {
        truncated = true;
        break;
      }
    }
  }

  const unique = new Map<string, PolymarketActivity>();
  for (const row of collected) {
    const key = `${row.transactionHash}:${row.asset}:${row.side}:${row.size}:${row.timestamp}`;
    unique.set(key, row);
  }
  return {
    rows: Array.from(unique.values()).sort((a, b) => a.timestamp - b.timestamp),
    truncated
  };
}

async function getPositionPages(path: "positions" | "closed-positions", user: string) {
  if (!validWallet(user)) throw new Error("Invalid source wallet address.");
  const rows: PolymarketPosition[] = [];
  let truncated = false;
  for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      user,
      limit: PAGE_SIZE.toString(),
      offset: offset.toString()
    });
    const page = parsePositions(await readJson(`${DATA_API}/${path}?${params}`));
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE > MAX_OFFSET) {
      truncated = true;
      break;
    }
  }
  return { rows, truncated };
}

export function getCurrentPositions(user: string) {
  return getPositionPages("positions", user);
}

export function getClosedPositions(user: string) {
  return getPositionPages("closed-positions", user);
}

export async function getNativePnl(
  user: string,
  interval: "1d" | "1w" | "1m" | "1y" | "ytd" | "all" = "all"
) {
  if (!validWallet(user)) throw new Error("Invalid source wallet address.");
  const fidelity = interval === "all" || interval === "1y" || interval === "ytd" ? "1d" : "1h";
  const params = new URLSearchParams({ user_address: user, interval, fidelity });
  const value = await readJson(`${USER_PNL_API}/user-pnl?${params}`);
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const t = finite(row.t, Number.NaN);
    const p = finite(row.p, Number.NaN);
    return Number.isFinite(t) && Number.isFinite(p) ? [{ t, p }] : [];
  }) as PolymarketPnlPoint[];
}

export async function getBatchPriceHistory(input: {
  assets: string[];
  start: number;
  end: number;
  fidelityMinutes: number;
}) {
  const history = new Map<string, PolymarketPricePoint[]>();
  const assets = Array.from(new Set(input.assets.filter(Boolean)));
  await Promise.all(chunks(assets, 20).map(async (marketBatch) => {
    const value = await readJson(`${CLOB_API}/batch-prices-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markets: marketBatch,
        start_ts: input.start,
        end_ts: input.end,
        fidelity: input.fidelityMinutes
      })
    });
    if (!value || typeof value !== "object") return;
    const source = (value as Record<string, unknown>).history;
    if (!source || typeof source !== "object") return;
    for (const [asset, points] of Object.entries(source as Record<string, unknown>)) {
      if (!Array.isArray(points)) continue;
      history.set(asset, points.flatMap((point) => {
        if (!point || typeof point !== "object") return [];
        const row = point as Record<string, unknown>;
        const t = finite(row.t, Number.NaN);
        const p = finite(row.p, Number.NaN);
        return Number.isFinite(t) && Number.isFinite(p) ? [{ t, p }] : [];
      }));
    }
  }));
  return history;
}
