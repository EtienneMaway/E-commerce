# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo for a mobile + web + API application for small traders/resellers to manage inventory, credit trading, and financial reconciliation.

## Monorepo Structure

```
e-commerce-app/
├── apps/
│   ├── api/          # NestJS backend
│   ├── mobile/       # Expo React Native (iOS + Android) — has its own CLAUDE.md
│   └── dashboard/    # Next.js web dashboard
├── packages/
│   └── types/        # Shared TypeScript interfaces (imported as @trading-app/types)
└── CLAUDE.md
```

Feature modules in `apps/api/src/`: `auth`, `users`, `inventory`, `sales`, `payments`, `dashboard`, `consignments`, `currency`, `external-contacts`, `stock-movements`, `expenses`, `withdrawals`, `activity-logs`, `employments`, `pricing`, `salary-payments`

Sibling planning docs at repo root (`DEPLOYMENT.md`, `PLAN.md`, `POS_AND_RECEIPTS.md`, `PERSONA_SWITCHING_PLAN.md`, `app_requirements.md`) capture product decisions that don't live in code — consult them when motivation behind a feature is unclear.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Package manager | pnpm workspaces |
| Backend | NestJS + TypeORM + PostgreSQL |
| API docs | Swagger (@nestjs/swagger) |
| Mobile | React Native 0.83 + Expo 55 + Expo Router |
| Web dashboard | Next.js 16 (App Router) + React 19 |
| Styling (mobile) | NativeWind (Tailwind for RN) |
| Styling (dashboard) | Tailwind CSS v4 + shadcn/ui |
| Data fetching | TanStack React Query v5 |
| State management | Zustand |
| Validation (API) | class-validator + class-transformer |
| Auth | JWT (jsonwebtoken / @nestjs/jwt) |
| Charts | Recharts |
| Logging | Winston (nest-winston) |

## Dev Commands

```bash
# From repo root
pnpm dev:api        # Start NestJS API (port 3000)
pnpm dev:mobile     # Start Expo mobile app
pnpm dev:dashboard  # Start Next.js dashboard (port 3001)
pnpm build:api      # Build NestJS API
pnpm build:dashboard  # Build Next.js dashboard
pnpm lint           # Lint all apps
pnpm test           # Run API tests (Jest)

# Inside apps/api
pnpm test           # Run unit tests
pnpm test:watch     # Watch mode
pnpm test:cov       # Coverage report
pnpm test:e2e       # E2E tests (jest-e2e.json config)
pnpm test -- --testPathPattern=inventory  # Run tests matching a pattern

pnpm migration:generate src/database/migrations/MigrationName  # run inside apps/api
pnpm migration:run                                              # runs against compiled JS — `pnpm build` first
pnpm migration:revert

# Mobile production builds (EAS Build — requires eas.json)
eas build --platform ios
eas build --platform android
```

> **DB note**: `synchronize` is **off everywhere** (including dev) in `apps/api/src/app.module.ts` — all schema changes go through migrations so dev exercises the same path as production. After adding/altering an entity you must generate & run a migration; the schema will not auto-sync. Write migrations idempotently (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE TYPE` wrapped in `DO $$ … EXCEPTION WHEN duplicate_object`, `CREATE INDEX IF NOT EXISTS`) so they can run cleanly on databases that pre-date them. Migrations live in `apps/api/src/database/migrations/` and the migration data source is `apps/api/src/database/database.config.ts`. That file maintains its own entity list separate from `app.module.ts`, so when adding a new entity that participates in migrations, register it in both places.

## General Conventions

### TypeScript
- Strict mode enabled everywhere (`"strict": true` in all tsconfigs)
- No `any` — use `unknown` when type is uncertain, then narrow
- Prefer `type` for unions/intersections, `interface` for object shapes
- Always type function return values explicitly
- Use `readonly` on properties that should not be mutated

### Naming
- Files: `kebab-case` everywhere (e.g., `inventory.service.ts`, `sale-transaction.entity.ts`)
- Classes: `PascalCase` (e.g., `InventoryService`, `SaleTransaction`)
- Variables/functions: `camelCase`
- Constants/enums: `UPPER_SNAKE_CASE` for values, `PascalCase` for enum names
- Database columns: `snake_case` (via TypeORM `@Column({ name: 'unit_cost' })`)
- API routes: `kebab-case` (e.g., `/inventory/top-sold`, `/payments/to-supplier`)

### No magic numbers
- Define constants for business rules (e.g., `LOW_STOCK_THRESHOLD = 5`, `OVERDUE_DAYS = 30`)
- Keep them in `apps/api/src/common/constants.ts`

## NestJS (Backend) Conventions

### Module structure
Each feature module follows this layout:
```
src/inventory/
├── inventory.module.ts
├── inventory.controller.ts     # Routes only, no logic
├── inventory.service.ts        # Business logic
├── dto/
│   ├── add-personal.dto.ts
│   └── ...
```

All entities live in `apps/api/src/entities/` (not inside modules).

Entities: `User`, `InventoryEntry`, `SupplierDebt`, `DebtorCredit`, `Payment`, `SaleTransaction`, `ConsignmentRequest`, `ConsignmentItem`, `ExchangeRate`, `ExternalContact`, `ExternalTransaction`, `StockMovement`, `Expense`, `Withdrawal`, `Employment`, `ProductPrice`, `SalaryPayment`

### Controllers
- Thin controllers: only parse request, call service, return response
- Use `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()` on every endpoint (Swagger)
- Use `@ApiBearerAuth()` on all protected controllers

### Services
- All business logic lives in services
- Services return typed results, never throw HTTP exceptions — let controllers/filters handle that
- Use `EntityManager` transactions for operations that touch multiple tables (e.g., receiving stock + updating debt)

### DTOs
- Every request body has a DTO with `class-validator` decorators
- Use `@IsUUID()`, `@IsDecimal()`, `@IsPositive()`, `@IsOptional()`, `@IsEnum()` appropriately
- Transform strings to numbers where needed with `@Type(() => Number)`
- Global `ValidationPipe` is configured with `whitelist: true, forbidNonWhitelisted: true` — unknown fields are rejected

### TypeORM Entities
- Use UUIDs: `@PrimaryGeneratedColumn('uuid')`
- Use `decimal` columns for all money: `@Column({ type: 'decimal', precision: 14, scale: 4 })` — **4 decimal places**, not 2 (see "Money precision" below)
- Always define `@CreateDateColumn()` and `@UpdateDateColumn()` where relevant
- Name database columns explicitly: `@Column({ name: 'unit_cost' })`
- All entity files in `apps/api/src/entities/`

### Error handling
- Use NestJS built-in exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`, `UnprocessableEntityException`
- Price guard returns `UnprocessableEntityException` (HTTP 422) with structured body: `{ warning: true, costPrice, potentialLoss }`
- Two global exception filters in `apps/api/src/common/filters/`:
  - `AllExceptionsFilter` — catch-all fallback
  - `HttpExceptionFilter` — handles HTTP exceptions with EN/FR i18n translations

### i18n
- API reads `Accept-Language` header (default: `en`, supports `fr`)
- Error message translations defined in `apps/api/src/common/i18n/messages.ts`
- All API calls from dashboard and mobile must send the `Accept-Language` header
- Mobile and dashboard each have a `lib/i18n.ts` with full EN/FR translation objects and a `store/locale.store.ts` (Zustand) for persisting the user's language preference

### Rate limiting (Throttler)
- Global: 100 requests/minute
- Login endpoint (`POST /auth/login`): 10 requests/minute

### Swagger
- Swagger UI available at `http://localhost:3000/api/docs` in development
- All DTOs decorated with `@ApiProperty()` — include `example` values
- All endpoints documented with `@ApiOperation({ summary: '...' })`
- Response schemas use `@ApiResponse({ type: ResponseDto })`

## Mobile (Expo) Conventions

### File structure
```
apps/mobile/
├── app/                          # Expo Router (file = route)
│   ├── (auth)/                   # Unauthenticated routes
│   ├── (tabs)/                   # Bottom tab routes (home, inventory, network, sales)
│   ├── supplier/[id].tsx         # Dynamic detail screens
│   ├── debtor/[id].tsx
│   ├── product/[name].tsx
│   ├── external-contact/[id].tsx
│   ├── external-contacts.tsx     # External contacts list
│   └── consignments.tsx          # Consignments inbox
├── components/
│   ├── ui/                   # Primitive components (Button, Input, Card, Badge, StatCard, EmptyState)
│   ├── forms/                # Form modals (bottom sheets)
│   └── cards/                # Domain cards
├── lib/
│   ├── api.ts                # Axios instance with JWT interceptor + Accept-Language header
│   ├── query-keys.ts         # React Query key constants (QK.* factory)
│   ├── utils.ts              # formatCurrency, formatDate, getErrorMessage, isPriceGuardWarning, getPriceGuardWarning
│   ├── currency.ts           # USD/FC conversion utilities
│   ├── notifications.ts      # Push notification helpers
│   ├── receipt.ts            # Receipt generation
│   ├── sync.ts               # Offline sync logic
│   └── i18n.ts               # Full EN/FR translation strings
└── store/
    ├── auth.store.ts         # Zustand: token + currentUser (hydrate, login, logout)
    ├── locale.store.ts       # Zustand: language preference (en/fr)
    ├── theme.store.ts        # Zustand: theme preference (light/dark)
    └── offline.store.ts      # Zustand: offline sync queue
```

TypeScript path alias: `@/*` resolves to the mobile app root.

`RecordSaleModal.tsx` is the reference implementation for price guard 422 handling — use `isPriceGuardWarning(error)` / `getPriceGuardWarning(error)` from `lib/utils.ts` then re-submit with `{ confirmedOverride: true }` on user confirmation.

Metro is configured to watch the full monorepo and resolves singleton packages (react, react-native) from mobile's own node_modules to avoid dual-context issues.

### Components
- Functional components only, no class components
- Props typed with `interface`, never inline object types
- Use `NativeWind` className for all styling — no `StyleSheet.create`
- Shared UI primitives (`Button`, `Input`, `Badge`) in `components/ui/`

### Data fetching
- All server state via `@tanstack/react-query`
- Query keys defined as constants in `lib/query-keys.ts`
- Mutations invalidate relevant queries on success
- No direct API calls outside of `lib/api.ts` functions

### Navigation
- No `useNavigation()` — use typed Expo Router `router.push()` / `<Link>`
- Auth guard in root `_layout.tsx` — redirect to `/login` if no token in SecureStore

## Dashboard (Next.js) Conventions

### Important: type imports
- `@trading-app/types` is **not** imported in the dashboard (not in package.json). Define types inline per page/component.

### Data fetching
- Server Components for initial page data (fetch directly, no client bundle cost)
- `useQuery` (React Query) for interactive/real-time widgets
- All API calls through `lib/api.ts` (shared pattern with mobile, includes `Accept-Language` header)

### Route structure
```
app/
├── (main)/                  # Authenticated layout with sidebar
│   ├── dashboard/           # Financial overview + charts
│   ├── inventory/           # Inventory table + [name] product detail
│   ├── suppliers/           # List + [id] detail
│   ├── debtors/             # List + [id] detail
│   ├── sales/               # History table + top-products/
│   ├── consignments/        # Outgoing/Incoming tabs
│   ├── external-contacts/   # External contacts list
│   ├── expenses/            # Expense tracker
│   ├── withdrawals/         # Owner withdrawals
│   └── settings/            # User settings
├── login/
└── register/
```

TypeScript path alias: `@/*` resolves to the dashboard app root.

Dashboard also has `store/currency.store.ts` (Zustand) for the USD/FC display toggle.

### Components
- shadcn/ui components for tables, dialogs, forms
- Recharts for all charts
- Keep page files thin — extract components to `components/`

## Business Logic Rules (NEVER skip these)

1. **Price Guard**: Selling at or below unit cost MUST return a `422` warning. Only proceed if client sends `confirmedOverride: true`.
2. **Stock Priority**: When the same product exists in both SUPPLIER and PERSONAL stock, always deduct SUPPLIER stock first.
3. **Debt Upsert**: `SupplierDebt` and `DebtorCredit` are upserted by `(ownerId, supplierUserId)` unique constraint — never create duplicates.
4. **Atomic operations**: Receiving stock + updating debt must be in a single DB transaction. Same for recording a sale + decrementing stock. Same for renaming a product (cascades across `inventory_entries`, `sale_transactions`, `external_transactions`, `product_prices` in one transaction — see `inventory.service.ts:renameProduct`).
5. **Decimal precision**: All monetary calculations use `decimal.js` or TypeORM `decimal` columns. Never use JavaScript `number` for money. API responses serialize decimal columns as **strings** — parse with `decimal.js` or `parseFloat` on the client, never coerce directly to `number`.
6. **Product name normalization**: Product names are stored and compared in lowercase. Normalize on write.
7. **Consignment stock deduction**: Stock is only deducted from the supplier when the debtor confirms (`PATCH /consignments/:id/confirm`). Never on creation.
8. **Rename product**: Allowed only when no `CONSIGNED_IN`/`CONSIGNED_OUT` entries have `quantityRemaining > 0` for the product. Renames touch only owner-controlled tables — settled consignment rows keep the old name (counterparty's record).
9. **Currency**: The app supports dual-currency display (USD and FC — Congolese Franc). Exchange rates are stored in the `ExchangeRate` entity and managed via the `currency` module. The `currency.store.ts` in dashboard and `currency.ts` lib in both apps handle client-side conversion. The currency model is non-trivial — see "Currency & Cash Mental Model" below before touching expense, withdrawal, sale or pricing math.

## Money precision

- All money columns are `decimal(14, 4)` — 4 fractional digits. The most recent migration (`apps/api/src/database/migrations/1000000000006-BumpMoneyPrecisionTo4dp.ts`) bumped the previous `decimal(12, 2)` columns. Defaults are `'0.0000'`, not `'0.00'`.
- Services round/format money with `.toFixed(4)` (not `.toFixed(2)`). DTOs validate with `@IsDecimal({ decimal_digits: '1,4' })`.
- Display layers **truncate** rather than round when reducing precision — a stored `234.0099` rendered at 2dp shows as `234.00`, never `234.01`. Both `apps/dashboard/lib/currency.ts` and `apps/mobile/lib/utils.ts` use `Math.trunc(n * factor) / factor`. The underlying value is unchanged; only the rendered figure is truncated.

## Currency & Cash Mental Model

The most important conceptual rule in this codebase — read this carefully before changing anything that touches expenses, withdrawals, sales, or pricing.

**Two rates live in `exchange_rates`:**
- `usdToFcRate` — labelled in the UI as **"System Selling Rate"**. The canonical conversion rate. Used for the system-wide ledger: income booking, expense ledger value, withdrawal ledger value, all display conversions in `useFormatCurrency`.
- `sellingRate` (column name is historical; UI label is **"Current Market Rate"** — previously called "Buying Rate"). The less-favourable rate the merchant pays when exchanging FC for USD. Always ≥ `usdToFcRate` in a healthy configuration; the inverse triggers an `inverted_exchange_rates` alert in `dashboard.service.getAlerts`.

**Cash on hand is always FC.** Every cash inflow (direct sale, debtor payment, external `PAYMENT_IN`) sits in the till as FC. The system books these at the System Rate.

**Outflows in USD must be exchanged from FC at the Current Market Rate** — that's reality, since the merchant has no separate USD reserve. The flow on the API side:
- **FC outflow** (`amount` FC): `amountUsd = amount / systemRate`. Snapshots `usdToFcRateSnapshot = systemRate`.
- **USD outflow** (`amount` USD): if a Current Market Rate is set, `amountUsd = amount × buyingRate / systemRate` and snapshots `usdToFcRateSnapshot = buyingRate`. This `amountUsd` is the System-Rate USD value of the FC actually drained, so the ledger arithmetic stays consistent (income booked at System Rate ↔ outflow booked at System-Rate FC-reality).

`availableBusinessCash` (computed in `dashboard.service.getCashPosition`):
```
availableBusinessCash =
    directSalesCash + debtorPaymentsCash + externalPaymentInCash
  − totalExpenses
  − totalWithdrawn
```

The withdrawal and expense caps use this. Withdrawals are capped by `availableBusinessCash` only (you can pull out personal capital regardless of profit). Expenses are capped by **both** `availableProfitCash` and `availableBusinessCash` (you should not spend beyond earned profit).

**Display vs ledger USD diverge on the expenses page only.** The `/expenses` page renders all USD figures (top KPI, totals, per-row, byCategory) at the **Current Market Rate** — what FC outflows are realistically worth in USD — via the dedicated `totalExpensesAtBuyingRate` field on `CashPosition` and a local `fmtExpenseUsdAtBuyingRate` helper. The ledger (`totalExpenses`, all caps, profit math) still uses the System Rate. Don't conflate the two.

## Display conventions

- **Default web display**: 4dp money everywhere via `useFormatCurrency()` (`apps/dashboard/lib/currency.ts`). Pass `dp` to override per call: `formatCurrency(value, 2)` for tight cards.
- **Responsive web FC**: on viewports below Tailwind's `sm` breakpoint (640px), FC display drops to 0dp automatically (FC cards stay readable on phones). USD keeps 4dp at every size. The hook is `apps/dashboard/hooks/use-is-small-screen.ts`.
- **Mobile**: `useFormatCurrency()` in `apps/mobile/lib/currency.ts` defaults to **0dp FC** (no sub-unit physically exists). USD via `formatCurrency` in `lib/utils.ts` keeps 4dp.
- **Print receipts** (`PrintDialog`): FC always prints as whole numbers (`dp = 0`); USD keeps 4dp. Mobile receipts already rounded FC to whole numbers (`apps/mobile/lib/receipt.ts`).
- All `Intl.NumberFormat` for FC uses the `fr-CD` locale (thin-space thousand separators).

## Key endpoints worth knowing

Inventory and pricing endpoints frequently touched:
- `POST /inventory/personal` — add one product purchased with owner cash.
- `POST /inventory/personal/bulk` — add many products in a single atomic transaction. The Add Personal Product dialog uses this.
- `PATCH /inventory/products/:name/rename` — atomic cascade rename across `inventory_entries` (PERSONAL+SUPPLIER only), `sale_transactions`, `external_transactions`, `product_prices`. Blocked when active consignment-linked stock exists.
- `PATCH /inventory/:id/selling-price` — change selling price on a single entry.
- `POST /inventory/:entryId/adjust` — typed stock adjustment (damage, recount, customer return, supplier return, etc.).
- `GET /dashboard/alerts` — homepage alert feed. Alert types: `overdue_debtor`, `low_stock`, `pending_consignment`, `inverted_exchange_rates`.

## Consignment Status Lifecycle

```
[PENDING] → debtor confirms  → [ACCEPTED]   (stock deducted, entries created, DebtorCredit upserted)
          → debtor rejects   → [REJECTED]   (no side effects)
          → supplier cancels → [CANCELLED]  (only allowed while PENDING)
```

On confirmation (atomic transaction):
- Deducts qty from supplier's stock (SUPPLIER-first priority)
- Creates `InventoryEntry (CONSIGNED_OUT)` on supplier's books
- Creates `InventoryEntry (CONSIGNED_IN)` on debtor's books
- Upserts `DebtorCredit` for supplier (owner) ↔ debtor pair

## Security

- Passwords hashed with `bcryptjs` (12 salt rounds)
- JWT secret from environment variable (`JWT_SECRET`) — never hardcoded
- All routes except `/auth/register` and `/auth/login` require `JwtAuthGuard`
- Input validation via `class-validator` on all DTOs — `ValidationPipe` applied globally with `whitelist: true`
- Parameterized queries only — TypeORM handles this; never raw string interpolation in queries

## Environment Variables

```bash
# apps/api/.env
DATABASE_URL=postgresql://user:password@localhost:5432/trading_app
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
PORT=3000

# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:3000

# apps/dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Offline Support (Mobile)

The mobile app has an offline sync system:
- `store/offline.store.ts` — Zustand store that queues mutations when the device is offline
- `lib/sync.ts` — Processes the queue when connectivity is restored
- Mutations made offline are replayed in order against the API on reconnect

## Shared Types Package

`packages/types` is published as `@trading-app/types` and imported in the **mobile** app and **API**. The **dashboard** does NOT import this package — it defines types inline per page/component. Do not add `@trading-app/types` to the dashboard's dependencies.

## Git Conventions

- Branch names: `feat/step-X-description`, `fix/issue-description`
- Commit messages: imperative mood, e.g. `add inventory receive endpoint`, `fix price guard edge case`
- Never commit `.env` files
