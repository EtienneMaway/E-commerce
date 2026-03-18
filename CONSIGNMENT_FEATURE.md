# Consignment Feature — Two-Party Stock Transfer

## Problem

The existing `POST /inventory/consign` endpoint records a consignment **immediately and unilaterally** from the supplier's side only. The debtor (receiver) has no visibility, cannot confirm receipt, and the stock is never tracked on their account. This breaks real-world trust and auditability.

## Solution Overview

Introduce a **two-party consignment request flow** with a status lifecycle:

```
Supplier → [PENDING] → Debtor confirms → [ACCEPTED]
                     → Debtor rejects  → [REJECTED]
         → Supplier cancels (if PENDING) → [CANCELLED]
```

Stock is **only deducted** from the supplier when the debtor **confirms** reception. Only then are the financial records (DebtorCredit) updated and inventory entries created on both sides.

---

## New Database Entities

### `ConsignmentRequest`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `status` | enum | PENDING \| ACCEPTED \| REJECTED \| CANCELLED |
| `note` | varchar nullable | Optional message from supplier |
| `supplier_id` | uuid FK → User | The user sending goods |
| `debtor_id` | uuid FK → User | The user receiving goods |
| `confirmed_at` | timestamp nullable | Set on ACCEPTED |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### `ConsignmentItem` (line items per request)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `consignment_request_id` | uuid FK | |
| `product_name` | varchar | Lowercased |
| `quantity` | integer | |
| `agreed_unit_price` | decimal(12,2) | What debtor will owe per unit |
| `unit_cost` | decimal(12,2) | Copied from supplier's stock at send time |

### Updated `InventorySource` enum

```ts
enum InventorySource {
  PERSONAL       = 'PERSONAL',
  SUPPLIER       = 'SUPPLIER',
  CONSIGNED_OUT  = 'CONSIGNED_OUT',  // existing — supplier's outgoing record
  CONSIGNED_IN   = 'CONSIGNED_IN',   // NEW — debtor's incoming record
}
```

---

## API Endpoints

All routes prefixed with `/api`. All protected with `JwtAuthGuard`.

### Supplier actions

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/consignments` | Create a consignment request (one or more items) |
| `GET` | `/consignments/outgoing` | View all outgoing consignments (as supplier) |
| `PATCH` | `/consignments/:id/cancel` | Cancel a PENDING consignment |

#### `POST /consignments` request body
```json
{
  "debtorUserId": "uuid",
  "note": "optional message",
  "items": [
    {
      "productName": "Rice 50kg",
      "quantity": 10,
      "agreedUnitPrice": "32.00"
    }
  ]
}
```

**Behaviour:**
- Validates debtor exists and is not self
- Validates each item: stock exists and has sufficient `quantityRemaining` (SUPPLIER-first count)
- Does **NOT** deduct stock — only reserves intent
- Creates `ConsignmentRequest` (status: PENDING) + `ConsignmentItem` records
- Returns the created request with items

### Debtor actions

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/consignments/incoming` | View all incoming consignments (as debtor) |
| `PATCH` | `/consignments/:id/confirm` | Accept and receive the goods |
| `PATCH` | `/consignments/:id/reject` | Decline the consignment |

#### `PATCH /consignments/:id/confirm` behaviour (atomic transaction)
For each item in the request:
1. Re-validate stock is still sufficient (SUPPLIER-first priority)
2. Deduct `quantity` from supplier's `InventoryEntry` records (SUPPLIER → PERSONAL order)
3. Create `InventoryEntry` for supplier: `source: CONSIGNED_OUT`, linked to `DebtorCredit`
4. Create `InventoryEntry` for debtor: `source: CONSIGNED_IN`, linked to same `DebtorCredit`
5. Upsert `DebtorCredit` (supplier=owner, debtor=debtorUser): add `agreedUnitPrice × quantity` to `totalCreditGiven` + `outstandingBalance`
6. Set `ConsignmentRequest.status = ACCEPTED`, set `confirmedAt`

---

## Dashboard Alerts Update

`GET /api/dashboard/alerts` — add:
```json
{
  "pendingIncomingConsignments": 3
}
```

---

## Implementation Steps (in order)

### Step A — Backend: Entities
1. Create `apps/api/src/entities/consignment-request.entity.ts`
2. Create `apps/api/src/entities/consignment-item.entity.ts`
3. Add `CONSIGNED_IN` to `InventorySource` enum in `inventory-entry.entity.ts`
4. Export new entities from `apps/api/src/entities/index.ts`
5. Register new entities in `apps/api/src/app.module.ts` TypeORM config

### Step B — Backend: Consignments Module
1. Create `apps/api/src/consignments/` folder with:
   - `consignments.module.ts`
   - `consignments.controller.ts`
   - `consignments.service.ts`
   - `dto/create-consignment.dto.ts`
   - `dto/consignment-item.dto.ts`
2. Register `ConsignmentsModule` in `AppModule`

### Step C — Shared Types
1. Add to `packages/types/src/index.ts`:
   - `ConsignmentStatus` enum
   - `ConsignmentItem` interface
   - `ConsignmentRequest` interface
   - `CreateConsignmentDto` type

### Step D — Mobile: API Layer
1. Add `consignmentsApi` to `apps/mobile/lib/api.ts`
2. Add `QK.consignments` to `apps/mobile/lib/query-keys.ts`

### Step E — Mobile: Screens
1. Create `apps/mobile/app/consignments.tsx` — incoming consignment inbox
   - List of PENDING consignments sent to current user
   - Each card: supplier name, items summary, date, Confirm / Reject buttons
2. Add badge to inventory tab icon when `pendingIncomingConsignments > 0`
3. Update `ConsignToDebtorModal` to support multi-item selection and post to `POST /consignments`

---

## Data Flow Diagram

```
SUPPLIER APP                       SERVER                        DEBTOR APP
────────────────                ─────────────                ─────────────────
Pick product(s) + qty
+ select debtor
[Send Consignment] ──POST /consignments──▶ Creates ConsignmentRequest
                                           status: PENDING
                                           Items stored
                                           Stock NOT deducted

                                ◀──200 Created──

                                           ◀── GET /consignments/incoming ── Debtor polls/opens app
                                                                              Sees pending request
                                                                              [Confirm] or [Reject]

                                ◀──PATCH /consignments/:id/confirm──
                                (atomic transaction):
                                  - Deduct stock (SUPPLIER-first)
                                  - Create CONSIGNED_OUT entry (supplier)
                                  - Create CONSIGNED_IN entry (debtor)
                                  - Upsert DebtorCredit
                                  - Set status = ACCEPTED

                    ◀── Updated outgoing list ──    ◀── Updated incoming list ──
                    (supplier sees ACCEPTED)         (debtor sees CONSIGNED_IN stock)
```

---

## Key Rules (do not skip)

1. Stock validation happens **twice**: at `POST /consignments` (soft check) and at `PATCH /confirm` (hard check inside transaction). Between these two calls another sale may have reduced stock.
2. The `confirm` transaction must use the same SUPPLIER-first priority rule as sales.
3. `DebtorCredit` upsert uses `(ownerId=supplierId, debtorUserId=debtorId)` unique constraint — same as existing consign flow.
4. If any item fails stock validation during confirm, the entire transaction is rolled back — `ConsignmentRequest` stays PENDING.
5. A supplier can only cancel their own PENDING requests. A debtor can only confirm/reject requests sent to them.
6. `CONSIGNED_IN` entries are visible in debtor's `GET /inventory` — they represent goods in the debtor's possession that generate a debt.
