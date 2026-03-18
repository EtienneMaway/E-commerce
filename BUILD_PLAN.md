# Build Plan: Inventory & Credit Trading App

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native + Expo + Expo Router |
| Web Dashboard | Next.js (App Router) |
| Backend API | NestJS + TypeORM |
| Database | PostgreSQL |
| Auth | JWT (shared across mobile + dashboard) |
| Styling (Mobile) | NativeWind (Tailwind for RN) |
| Styling (Dashboard) | Tailwind CSS + shadcn/ui |
| Data Fetching | React Query (mobile + dashboard) |
| State Management | Zustand (mobile + dashboard) |
| Validation | class-validator + class-transformer (NestJS) |
| ORM | TypeORM |

---

## Monorepo Structure

```
e-commerce-app/
├── apps/
│   ├── mobile/              # Expo React Native app (iOS + Android)
│   ├── dashboard/           # Next.js web admin dashboard
│   └── api/                 # NestJS backend
├── packages/
│   └── types/               # Shared TypeScript interfaces
├── package.json             # Workspace root
└── BUILD_PLAN.md
```

---

## Step-by-Step Build Plan

---

### STEP 1 — Monorepo Bootstrap

**Goal:** All three apps scaffold, workspaces wired, TypeScript configured.

**Tasks:**
1. Init root `package.json` with `pnpm workspaces` (or `npm workspaces`)
2. Create `apps/api` → `nest new api --package-manager pnpm`
3. Create `apps/mobile` → `npx create-expo-app mobile --template blank-typescript`
4. Create `apps/dashboard` → `npx create-next-app dashboard --typescript --tailwind --app`
5. Create `packages/types` → bare TS package with shared interfaces
6. Add root scripts: `dev:api`, `dev:mobile`, `dev:dashboard`

**Output:** All three apps boot independently.

---

### STEP 2 — Shared Types Package

**File:** `packages/types/src/index.ts`

**Interfaces to export:**
- `User` — id, username, email, phone
- `InventoryEntry` — id, source, productName, unitCost, sellingPrice, category, quantityOriginal, quantityRemaining, createdAt, supplier?, debtor?
- `SupplierDebt` — id, ownerId, supplierUser, totalCreditReceived, totalPaid, outstandingBalance, payments[]
- `DebtorCredit` — id, ownerId, debtorUser, totalCreditGiven, totalReceived, outstandingBalance, payments[]
- `Payment` — id, amount, date, note, direction, remainingBalance
- `SaleTransaction` — id, productName, source, qtySold, unitCost, salePrice, profit, isLoss, date
- `ConsignmentStatus` — enum: PENDING | ACCEPTED | REJECTED | CANCELLED
- `ConsignmentItem` — id, productName, quantity, agreedUnitPrice, unitCost, consignmentRequestId
- `ConsignmentRequest` — id, status, note, confirmedAt, supplierId, supplier?, debtorId, debtor?, items[]
- API request/response DTOs for each endpoint (incl. `CreateConsignmentDto`, `CreateConsignmentItemDto`)

---

### STEP 3 — Database Schema (TypeORM)

**File:** `apps/api/src/entities/`

**Entities:**

```
User
├── id (uuid)
├── username (unique)
├── email (unique, nullable)
├── phone (unique, nullable)
├── passwordHash
├── createdAt
├── @OneToMany → outgoingConsignments (ConsignmentRequest[])
└── @OneToMany → incomingConsignments (ConsignmentRequest[])

InventoryEntry
├── id (uuid)
├── source: enum(PERSONAL | SUPPLIER | CONSIGNED_OUT | CONSIGNED_IN)
│           CONSIGNED_IN = received from supplier, lives on debtor's side
├── productName
├── unitCost: decimal
├── sellingPrice: decimal
├── category (nullable)
├── quantityOriginal: int
├── quantityRemaining: int
├── createdAt
├── @ManyToOne → owner (User)
├── @ManyToOne → supplierUser (User, nullable)
├── @ManyToOne → debtorUser (User, nullable)
├── @ManyToOne → supplierDebt (nullable)
└── @ManyToOne → debtorCredit (nullable)

SupplierDebt
├── id (uuid)
├── totalCreditReceived: decimal
├── totalPaid: decimal
├── outstandingBalance: decimal
├── createdAt / updatedAt
├── @ManyToOne → owner (User)
├── @ManyToOne → supplierUser (User)
├── @OneToMany → payments (Payment[])
└── @OneToMany → inventoryEntries (InventoryEntry[])
UNIQUE: (ownerId, supplierUserId)

DebtorCredit
├── id (uuid)
├── totalCreditGiven: decimal
├── totalReceived: decimal
├── outstandingBalance: decimal
├── createdAt / updatedAt
├── @ManyToOne → owner (User)
├── @ManyToOne → debtorUser (User)
├── @OneToMany → payments (Payment[])
└── @OneToMany → inventoryEntries (InventoryEntry[])
UNIQUE: (ownerId, debtorUserId)

Payment
├── id (uuid)
├── amount: decimal
├── note (nullable)
├── date
├── direction: enum(OWNER_TO_SUPPLIER | DEBTOR_TO_OWNER)
├── remainingBalance: decimal
├── @ManyToOne → supplierDebt (nullable)
└── @ManyToOne → debtorCredit (nullable)

SaleTransaction
├── id (uuid)
├── productName
├── source: string (PERSONAL | SUPPLIER)
├── qtySold: int
├── unitCost: decimal
├── salePrice: decimal
├── profit: decimal
├── isLoss: boolean
├── date
├── @ManyToOne → owner (User)
└── @ManyToOne → inventoryEntry (InventoryEntry)

ConsignmentRequest
├── id (uuid)
├── status: enum(PENDING | ACCEPTED | REJECTED | CANCELLED)
├── note (varchar, nullable)
├── confirmedAt (timestamp, nullable)
├── createdAt / updatedAt
├── @ManyToOne → supplier (User)  — the one sending goods
├── @ManyToOne → debtor (User)    — the one receiving goods
└── @OneToMany → items (ConsignmentItem[])  — cascade

ConsignmentItem
├── id (uuid)
├── productName
├── quantity: int
├── agreedUnitPrice: decimal   — what debtor owes per unit
├── unitCost: decimal          — snapshot of supplier's cost at request time
└── @ManyToOne → consignmentRequest (ConsignmentRequest, cascade delete)
```

**Output:** `typeorm migration:generate` creates all tables.

---

### STEP 4 — NestJS Backend: Auth Module

**Files:** `apps/api/src/auth/`

**Endpoints:**
- `POST /auth/register` — username, email/phone, password → hash password → save User → return JWT
- `POST /auth/login` — credentials → validate → return JWT
- `GET /auth/me` — protected, returns current user profile

**Implementation:**
- `AuthModule` with `JwtModule`, `PassportModule`
- `JwtStrategy` (Bearer token, validates userId from payload)
- `JwtAuthGuard` applied to all protected routes
- Passwords hashed with `bcryptjs`
- JWT payload: `{ sub: userId, username }`

---

### STEP 5 — NestJS Backend: Users Module

**Files:** `apps/api/src/users/`

**Endpoints:**
- `GET /users/search?q=` — search by username or phone (min 2 chars), excludes self

---

### STEP 6 — NestJS Backend: Inventory Module

**Files:** `apps/api/src/inventory/`

**Endpoints:**
- `GET /inventory` — all entries for authenticated owner
  - Query params: `source`, `supplierUserId`, `category`
  - Returns all four source types: PERSONAL, SUPPLIER, CONSIGNED_OUT, CONSIGNED_IN
- `POST /inventory/personal` — add personal product
  - Body: `{ productName, unitCost, sellingPrice, quantity, category? }`
  - Creates `InventoryEntry` with `source: PERSONAL`
- `POST /inventory/receive` — receive from supplier
  - Body: `{ supplierUserId, productName, unitCost, sellingPrice, quantity }`
  - Creates `InventoryEntry` with `source: SUPPLIER`
  - Upserts `SupplierDebt`: increases `totalCreditReceived` and `outstandingBalance`
- `POST /inventory/consign` — legacy single-party consign (manual/offline tracking only)
  - For two-party confirmed transfers, use the Consignments module (Step 9.5)
  - Creates `InventoryEntry` with `source: CONSIGNED_OUT` immediately, no debtor confirmation

---

### STEP 7 — NestJS Backend: Sales Module

**Files:** `apps/api/src/sales/`

**Endpoints:**
- `POST /sales` — record a sale
  - Body: `{ productName, qtySold, salePrice, confirmedOverride?: boolean }`
  - **Business Rule 1 — Price Guard:** if `salePrice ≤ unitCost`, return `HTTP 422` with `{ warning: true, costPrice, potentialLoss }` unless `confirmedOverride: true`
  - **Business Rule 2 — Stock Priority:** find all entries for `productName` (case-insensitive), sort SUPPLIER entries before PERSONAL, deduct from first available
  - Logs `SaleTransaction` with `profit = (salePrice - unitCost) × qtySold`
  - Sets `isLoss = true` if profit < 0
- `GET /sales` — list sales history
  - Query params: `productName`, `source`, `dateFrom`, `dateTo`, `page`, `limit`
- `GET /sales/top-products` — ranked products
  - Query params: `rankBy` (qty | revenue | profit), `period` (today | week | month | custom), `dateFrom?`, `dateTo?`

---

### STEP 8 — NestJS Backend: Payments Module

**Files:** `apps/api/src/payments/`

**Endpoints:**
- `POST /payments/to-supplier` — owner pays supplier
  - Body: `{ supplierUserId, amount, note? }`
  - Reduces `SupplierDebt.outstandingBalance`, increases `totalPaid`
  - Creates `Payment` record with `remainingBalance`
- `POST /payments/from-debtor` — debtor pays owner
  - Body: `{ debtorUserId, amount, note? }`
  - Reduces `DebtorCredit.outstandingBalance`, increases `totalReceived`
  - Creates `Payment` record with `remainingBalance`

---

### STEP 9 — NestJS Backend: Dashboard & Views Module

**Files:** `apps/api/src/dashboard/`

**Endpoints:**
- `GET /dashboard` — financial summary
  - Returns: `{ totalIOwe, totalOwedToMe, netPosition, totalProfitAllTime }`
- `GET /dashboard/suppliers` — all suppliers with balances
- `GET /dashboard/suppliers/:userId` — supplier detail
  - Products received, total sold value, amount owed, payment history, running balance
- `GET /dashboard/debtors` — all debtors with balances
- `GET /dashboard/debtors/:userId` — debtor detail
  - Products consigned, amount owed by debtor, payment history, running balance
- `GET /dashboard/profit-by-product` — profit breakdown per product
- `GET /dashboard/profit-by-source` — profit: personal stock vs each supplier's stock
- `GET /dashboard/alerts` — now includes `{ type: 'pending_consignment', pendingCount }` when the user has unconfirmed incoming consignments

---

### STEP 9.5 — NestJS Backend: Consignments Module

**Files:** `apps/api/src/consignments/`

**Purpose:** Two-party confirmed stock transfer. Supplier proposes; debtor confirms. Stock is only deducted and financial records only created upon debtor confirmation.

**Status lifecycle:**
```
[PENDING] → debtor confirms → [ACCEPTED]  (stock deducted, entries created, DebtorCredit upserted)
          → debtor rejects  → [REJECTED]  (no side effects)
          → supplier cancels (if PENDING) → [CANCELLED]
```

**Endpoints:**

- `POST /consignments` — supplier creates a consignment request
  - Body: `{ debtorUserId, note?, items: [{ productName, quantity, agreedUnitPrice }] }`
  - Soft-validates stock availability (SUPPLIER-first count) per item
  - Snapshots `unitCost` from supplier's current stock onto each `ConsignmentItem`
  - Creates `ConsignmentRequest` (status: PENDING) + `ConsignmentItem` records
  - Does **not** deduct stock
- `GET /consignments/outgoing` — supplier views all requests they sent
- `PATCH /consignments/:id/cancel` — supplier cancels a PENDING request
- `GET /consignments/incoming` — debtor views all requests addressed to them
- `PATCH /consignments/:id/confirm` — debtor confirms receipt (atomic transaction)
  - Hard-validates stock is still sufficient inside the transaction (race-condition safe)
  - Deducts qty from supplier's entries (SUPPLIER-first priority)
  - Creates `InventoryEntry` (source: CONSIGNED_OUT) on supplier's books, linked to `DebtorCredit`
  - Creates `InventoryEntry` (source: CONSIGNED_IN) on debtor's books, linked to same `DebtorCredit`
  - Upserts `DebtorCredit` (owner=supplier, debtor=debtor): adds `agreedUnitPrice × qty` to `totalCreditGiven` + `outstandingBalance`
  - Sets `ConsignmentRequest.status = ACCEPTED`, records `confirmedAt`
- `PATCH /consignments/:id/reject` — debtor rejects; no stock changes

**Business rules enforced:**
- If any item fails the hard stock check during confirm, the entire transaction rolls back — request stays PENDING
- Ownership enforced: only the addressed debtor can confirm/reject; only the sending supplier can cancel
- `DebtorCredit` upserted by UNIQUE(ownerId=supplierId, debtorUserId) — same constraint as rest of app

---

### STEP 10 — Mobile App: Setup & Navigation

**File:** `apps/mobile/`

**Tasks:**
1. Install dependencies: `expo-router`, `nativewind`, `@tanstack/react-query`, `zustand`, `axios`, `expo-secure-store`
2. Configure NativeWind (Tailwind) with `tailwind.config.js`
3. Create `lib/api.ts` — Axios instance with base URL + JWT interceptor (reads token from SecureStore)
4. Create `store/auth.store.ts` — Zustand store: `{ token, user, login(), logout() }`
5. Set up navigation layout:
   - `app/_layout.tsx` — auth guard (redirect to `/login` if no token)
   - `app/(auth)/_layout.tsx` — stack for login/register
   - `app/(tabs)/_layout.tsx` — bottom tab navigator (4 tabs)

---

### STEP 11 — Mobile App: Auth Screens

**Files:** `apps/mobile/app/(auth)/`

- **`login.tsx`** — Email/phone + password form → `POST /auth/login` → store JWT → navigate to tabs
- **`register.tsx`** — Username + email/phone + password → `POST /auth/register` → auto-login

---

### STEP 12 — Mobile App: Inventory Screen

**File:** `apps/mobile/app/(tabs)/inventory.tsx`

**UI:**
- Product list (FlatList) with cards showing: name, source badge (Personal/Supplier/Sent out/Received), unit cost, selling price, qty remaining
- Filter bar: All | Personal | Supplier | Sent out (CONSIGNED_OUT) | Received (CONSIGNED_IN)
- Pending consignments banner: shown at top when user has PENDING incoming requests — taps to `app/consignments.tsx`
- FAB (Floating Action Button) → action sheet: "Add Personal", "Receive from Supplier", "Consign to Debtor"

**Modals (bottom sheets):**
- `AddPersonalProductModal` — form with productName, unitCost, sellingPrice, qty, category
- `ReceiveFromSupplierModal` — user search → select supplier → form
- `ConsignToDebtorModal` — user search → select debtor → select product from inventory → qty + price → posts to `POST /consignments`

**Consignments inbox** (`app/consignments.tsx`):
- Lists all incoming `ConsignmentRequest` records (all statuses, newest first)
- Each card: supplier name, date, line items with qty + price/unit, total value, optional note, status badge
- PENDING cards show "Confirm receipt" + "Reject" buttons with confirmation dialogs
- On confirm: invalidates inventory + dashboard queries so balances update immediately

**Record Sale flow:**
- Long press on inventory item → "Record Sale" bottom sheet (works for PERSONAL, SUPPLIER, and CONSIGNED_IN)
- CONSIGNED_OUT items are not sellable (sent to someone else)
- Shows current unitCost prominently
- If `salePrice ≤ unitCost`: red warning alert with loss amount, requires explicit "Sell at a Loss" confirmation
- Displays which stock source will be deducted (supplier first label)

---

### STEP 13 — Mobile App: Dashboard (Home Tab)

**File:** `apps/mobile/app/(tabs)/index.tsx`

**UI — Financial Summary Cards:**
- "I Owe" card → total outstanding to all suppliers (red)
- "Owed to Me" card → total outstanding from all debtors (green)
- "Net Position" card → difference
- "Total Profit" card → all-time profit
- Quick links → Suppliers list, Debtors list

---

### STEP 14 — Mobile App: Network Tab (Suppliers & Debtors)

**File:** `apps/mobile/app/(tabs)/network.tsx`

**UI:**
- Top segmented control: "Suppliers" | "Debtors"
- Suppliers list: username, outstanding balance owed
- Debtors list: username, outstanding balance owed by them
- Tap → navigate to detail screen

**Supplier Detail** (`app/supplier/[id].tsx`):
- Products received from this supplier (name, cost, original qty, remaining qty, value)
- Total sold from this supplier's products
- Total owed + payment history (installments with dates)
- Running balance after each payment
- "Make Payment" button → `PaySupplierModal`

**Debtor Detail** (`app/debtor/[id].tsx`):
- Products consigned to debtor
- Total owed by debtor + payment history
- Running balance
- "Record Payment Received" button → `RecordDebtorPaymentModal`

---

### STEP 15 — Mobile App: Sales Tab

**File:** `apps/mobile/app/(tabs)/sales.tsx`

**UI:**
- Toggle: "Sales History" | "Top Products"
- **Sales History**: list with date, product, qty, cost, sale price, profit (red if loss), source badge
  - Search bar + date range filter
- **Top Products**: ranked list with rank badge, product name, metric value
  - Toggle: By Qty | By Revenue | By Profit
  - Period filter: Today | This Week | This Month | Custom

---

### STEP 16 — Web Dashboard (Next.js)

**File:** `apps/dashboard/`

**Purpose:** Managers/owners can log in via browser and view all analytics.

**Auth:** Same JWT endpoint as mobile. Store token in `httpOnly` cookie or `localStorage`.

**Pages:**

```
/                    → redirect to /dashboard
/login               → login form (same API)
/dashboard           → Financial Summary (overview cards + charts)
/inventory           → Inventory table (filterable, paginated)
/suppliers           → Suppliers list → /suppliers/[id]
/debtors             → Debtors list → /debtors/[id]
/sales               → Sales history table + export
/sales/top-products  → Charts: top products by qty/revenue/profit
```

**Dashboard Page Metrics (with charts using Recharts or Chart.js):**
- KPI cards: Total Owe | Total Owed to Me | Net Position | Total Profit
- Line chart: Profit over time (last 30 days)
- Bar chart: Top 5 products by profit
- Pie chart: Profit split by source (Personal vs each Supplier)
- Recent sales table (last 10 transactions)

**Components (shadcn/ui):**
- DataTable for inventory, sales, payments (with sorting + filtering)
- Cards for KPIs
- DateRangePicker for filtering
- Tabs for Suppliers/Debtors

---

### STEP 17 — Notifications & Alerts

**Backend:**
- Price guard already returns `HTTP 422` with warning details
- `GET /dashboard/alerts` returns three alert types: `overdue_debtor`, `low_stock`, `pending_consignment`

**Mobile:**
- Price guard: `Alert.alert()` with cost price and loss amount shown
- Overdue debtor: local push notification (Expo Notifications) if balance outstanding > 30 days (configurable)
- Low stock: in-app badge on inventory item when `quantityRemaining < 5` (threshold configurable)
- Loss sale flagged: red badge in sales history, icon in `SaleTransaction.isLoss`
- Pending consignments: banner on inventory tab showing count → taps to consignments inbox

---

### STEP 18 — Testing

**Backend (Jest + Supertest):**
- Unit tests: `sales.service.spec.ts` — price guard logic, stock priority algorithm
- Unit tests: `inventory.service.spec.ts` — debt upsert, stock deduction
- Integration tests: each route with auth token (register → login → use token)

**E2E Validation Scenarios:**
1. Register User A and User B
2. User A receives stock from User B → verify `SupplierDebt` created
3. User A records a sale at cost price → verify warning returned
4. User A confirms loss sale → verify `SaleTransaction.isLoss = true`
5. Same product in SUPPLIER + PERSONAL → sale deducts SUPPLIER first
6. User A pays User B → verify `outstandingBalance` decreases, `Payment` record logged
7. User B consigns stock back to User A as debtor → verify `DebtorCredit` created
8. Dashboard totals match sum of all individual balances
9. **Consignment flow:**
   - User A sends consignment request to User B (2 products) → status PENDING, stock NOT deducted
   - User B calls `GET /consignments/incoming` → sees the request
   - User B confirms → `CONSIGNED_OUT` entry on A's books, `CONSIGNED_IN` entry on B's books, `DebtorCredit` upserted, status ACCEPTED
   - User B's inventory shows CONSIGNED_IN items; User A's shows CONSIGNED_OUT
10. **Consignment reject/cancel:**
    - User A sends another request → User B rejects → no stock change, status REJECTED
    - User A sends another request → User A cancels before debtor acts → status CANCELLED

---

## Summary of Deliverables

| # | Deliverable | Stack | Status |
|---|-------------|-------|--------|
| 1 | Monorepo scaffold | pnpm workspaces | ✅ Done |
| 2 | Shared types package | TypeScript | ✅ Done |
| 3 | Database schema + migrations | TypeORM + PostgreSQL | ✅ Done |
| 4 | Auth API (register/login/me) | NestJS + JWT | ✅ Done |
| 5 | User search API | NestJS | ✅ Done |
| 6 | Inventory API (4 entry types + debt logic) | NestJS | ✅ Done |
| 7 | Sales API (price guard + stock priority) | NestJS | ✅ Done |
| 8 | Payments API (installments + history) | NestJS | ✅ Done |
| 9 | Dashboard/Suppliers/Debtors/Alerts API | NestJS | ✅ Done |
| 9.5 | Consignments API (two-party request + confirm flow) | NestJS | ✅ Done |
| 10 | Mobile navigation shell + auth guard | Expo Router | ✅ Done |
| 11 | Mobile auth screens | React Native | ✅ Done |
| 12 | Mobile inventory screen + modals + consignments inbox | React Native | ✅ Done |
| 13 | Mobile dashboard (financial summary) | React Native | ✅ Done |
| 14 | Mobile network tab (supplier + debtor details) | React Native | ✅ Done |
| 15 | Mobile sales tab (history + top products) | React Native | ✅ Done |
| 16 | Web dashboard (Next.js + charts + tables) | Next.js | ✅ Done |
| 17 | Notifications + alerts (incl. pending consignments) | Expo + NestJS | ✅ Done |
| 18 | Tests | Jest + Supertest | ⬜ Pending |
