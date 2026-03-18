# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo for a mobile + web + API application for small traders/resellers to manage inventory, credit trading, and financial reconciliation.

## Monorepo Structure

```
e-commerce-app/
├── apps/
│   ├── api/          # NestJS backend
│   ├── mobile/       # Expo React Native (iOS + Android)
│   └── dashboard/    # Next.js web dashboard
├── packages/
│   └── types/        # Shared TypeScript interfaces (imported as @trading-app/types)
├── CLAUDE.md
└── BUILD_PLAN.md
```

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
pnpm lint           # Lint all apps
pnpm test           # Run API tests (Jest)

# Inside apps/api
pnpm test           # Run unit tests
pnpm test:watch     # Watch mode
pnpm test:cov       # Coverage report
pnpm test:e2e       # E2E tests (jest-e2e.json config)

pnpm typeorm migration:generate src/migrations/MigrationName
pnpm typeorm migration:run
pnpm typeorm migration:revert
```

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
- Use `decimal` columns for all money: `@Column({ type: 'decimal', precision: 12, scale: 2 })`
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
├── app/                      # Expo Router (file = route)
│   ├── (auth)/               # Unauthenticated routes
│   ├── (tabs)/               # Bottom tab routes
│   ├── supplier/[id].tsx     # Dynamic detail screens
│   ├── debtor/[id].tsx
│   └── consignments.tsx      # Consignments inbox
├── components/
│   ├── ui/                   # Primitive components (Button, Input, Card)
│   ├── forms/                # Form modals (bottom sheets)
│   └── cards/                # Domain cards (ProductCard, SupplierCard)
├── lib/
│   ├── api.ts                # Axios instance with JWT interceptor + Accept-Language header
│   ├── query-keys.ts         # React Query key constants
│   └── utils.ts              # formatCurrency, formatDate helpers
└── store/
    └── auth.store.ts         # Zustand: token + currentUser
```

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
├── (main)/           # Authenticated layout with sidebar
│   ├── dashboard/    # Financial overview + charts
│   ├── inventory/    # Inventory table
│   ├── suppliers/    # List + [id] detail
│   ├── debtors/      # List + [id] detail
│   ├── sales/        # History table + top-products/
│   └── consignments/ # Outgoing/Incoming tabs
└── login/
```

### Components
- shadcn/ui components for tables, dialogs, forms
- Recharts for all charts
- Keep page files thin — extract components to `components/`

## Business Logic Rules (NEVER skip these)

1. **Price Guard**: Selling at or below unit cost MUST return a `422` warning. Only proceed if client sends `confirmedOverride: true`.
2. **Stock Priority**: When the same product exists in both SUPPLIER and PERSONAL stock, always deduct SUPPLIER stock first.
3. **Debt Upsert**: `SupplierDebt` and `DebtorCredit` are upserted by `(ownerId, supplierUserId)` unique constraint — never create duplicates.
4. **Atomic operations**: Receiving stock + updating debt must be in a single DB transaction. Same for recording a sale + decrementing stock.
5. **Decimal precision**: All monetary calculations use `decimal.js` or TypeORM `decimal` columns. Never use JavaScript `number` for money.
6. **Product name normalization**: Product names are stored and compared in lowercase. Normalize on write.
7. **Consignment stock deduction**: Stock is only deducted from the supplier when the debtor confirms (`PATCH /consignments/:id/confirm`). Never on creation.

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

## Git Conventions

- Branch names: `feat/step-X-description`, `fix/issue-description`
- Commit messages: imperative mood, e.g. `add inventory receive endpoint`, `fix price guard edge case`
- Never commit `.env` files
