# PM-Model-WebPannel — Agent Instructions

## Project Overview
Read-only Polymarket prediction-market analytics dashboard. Displays wallet performance, strategy comparisons, KPIs, and a trade evidence feed. Dark-terminal aesthetic with profit/loss color coding.

## Tech Stack
- **Framework:** Next.js 15 (App Router), React 19
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL via Neon, Prisma ORM
- **Styling:** Tailwind CSS 3, shadcn/ui components
- **Icons:** lucide-react

## Architecture
- Single server-rendered page (`app/page.tsx`)
- URL-driven filters via `searchParams` — no client-side state
- Data flow: `page.tsx` → `getDashboardData(filters)` → Prisma queries → in-memory aggregation → client components
- No API routes — all data fetching in the server component
- No authentication — purely read-only

## Directory Structure
| Path | Purpose |
|---|---|
| `app/` | Next.js App Router (layout, page, globals.css) |
| `components/ui/` | shadcn/ui primitives (Button, Card, Badge, Input, Select) |
| `components/dashboard/` | Domain components (Dashboard, FilterBar, KpiStrip, WalletTable, StrategyTable, EvidenceTable) |
| `lib/` | Types, Prisma client, utilities, analytics engine |
| `prisma/` | Prisma schema (8 models), migrations |

## Conventions
- **Components:** Server components for data fetching; client components for interactivity (FilterBar, Dashboard)
- **Class merging:** Use `cn()` from `lib/utils.ts` (clsx + tailwind-merge)
- **Colors:** cyan-500 primary, green-500 profit, red-500 loss, yellow-500 caution, zinc terminal backgrounds
- **Formatting:** Use `formatCurrency()`, `formatPercent()`, `formatCompact()`, `shortWallet()` from `lib/utils.ts`
- **UI:** Build with shadcn/ui primitives (Card, Badge, Button, Select, Input) — avoid raw HTML
- **Badge variants:** `default`, `secondary`, `outline`, `profit`, `loss`, `caution`
- **Imports:** Use `@/` alias (e.g. `@/lib/types`, `@/components/ui/button`)

## Build & Dev Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npx prisma generate` — Regenerate Prisma client after schema changes
- `npx prisma db push` — Push schema to database

## Database
8 models defined in `prisma/schema.prisma`:

| Model | Table | Purpose |
|---|---|---|
| Event | `event` | Polymarket events |
| Market | `market` | Markets (linked to Event, Trade, PaperTrade, etc.) |
| Trade | `trades` | Live trading records |
| PaperTrade | `paper_trades` | Paper trading records |
| TradeAnalyticsEvent | `trade_analytics_events` | Rich analytics event log (primary dashboard table) |
| PriceHistory | `price_history` | Market price ticks |
| InsiderPositionHistory | `insider_position_history` | Insider wallet position snapshots |
| FlaggedWallet | `flagged_wallets` | Suspicious wallet scoring |
| FlaggedWalletMm | `flagged_wallets_mm_test` | Mirror flagged wallets for market-maker test |

Key relationship: Market ↔ Trade, PaperTrade, TradeAnalyticsEvent, PriceHistory, InsiderPositionHistory. Market → Event.

## Testing
- Tests are not yet implemented
- When adding tests, place them in a `__tests__/` directory co-located with the module
- Use Vitest as the test runner (install if needed)
- Test data-fetching logic with mocked Prisma responses
- Test client components with @testing-library/react
- Run `npm run test` to execute the suite

## Agent Guidelines
1. Read `prisma/schema.prisma` first before writing database queries
2. Check `lib/types.ts` for existing types before creating new ones
3. Follow patterns in `lib/analytics.ts` for data fetching (use `getPrisma()`, in-memory filtering)
4. Use shadcn/ui components over raw HTML elements
5. Keep components modular — extract reusable pieces into `components/ui/`
6. Verify lint passes with `npm run lint` before finishing
