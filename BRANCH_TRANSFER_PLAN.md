# Branch-to-branch stock transfer — plan

> Status: **v3. Decisions settled 2026-11-11 (§8). Phases 1–4 BUILT: API (migrations 041 + 042 RUN on dev, 67/67 live QA checks), dashboard `/branch-transfers`, and mobile `app/branch-transfers.tsx`. Phase 5 remains: browser check of the dashboard and on-device QA.**
> Replaces the cross-business draft (`SHOP_TRADE_PLAN.md`, deleted). Section 8 still has open questions.

## 1. What the feature is

One business owner runs several branches. Branch A has stock that isn't moving,
or that Branch B needs. Instead of buying new stock for B, the owner moves it
from A to B.

1. **Send.** A sends products and quantities to B. The goods **leave A's
   sellable stock immediately** and go into **escrow** (in transit). They belong
   to neither shelf: A can't sell them and B can't sell them yet.
2. **Verify and receive.** B checks what physically arrived and **accepts** it,
   which moves the goods onto B's stock. B can also **reject** it, which puts the goods back on
   A's shelf, on the same lots they came from.
3. **B owes A.** On accept, B owes A the value of what it received. B pays A back
   in money, and A confirms each payment.

Only two kinds of people can act, on both the sending and the receiving side:
- the **owner of the business**, or
- the **person in charge of that branch**: the custodian of the branch's open
  custody (`stock_custodies`, one OPEN per branch, enforced by
  `custody.service.ts:107`). No other employee can send or receive, whatever
  their role.

Scope: branches of **the same business** only. The existing person-to-person
consignment (including to other businesses and to minis) is unchanged.

## 2. Why this is a new module, not consignments

| | Consignment (today) | Branch transfer (new) |
|---|---|---|
| Parties | Two **people** (supplier user → debtor user) | Two **branches** of one business |
| Stock on send | Stays on sender's shelf until confirm | **Leaves into escrow at once** |
| Reject | No stock effect | Stock **returns** to the sender's lots |
| Receiver's cost basis | Agreed price (sender's profit baked in) | Sender's **unit cost carried over** (no internal profit, see Q1) |
| Debt ledger | `DebtorCredit` ↔ `SupplierDebt`, keyed on users | **Inter-branch balance**, keyed on shops |
| Who acts | Debtor owner | Owner or the branch's custodian, on **both** ends |

Reusing `supplier_debts`/`debtor_credits` would make the owner appear as **their
own supplier and their own debtor** on the supplier and debtor pages. Those rows
would also collide on `UQ_supplier_debts_shop_owner_supplier` the moment a third
branch takes part. A small dedicated ledger is cleaner and keeps the existing
debt pages honest.

## 3. Data model (migration 041, idempotent)

### 3.1 `branch_transfers`
| column | notes |
|---|---|
| `id` uuid | |
| `org_id` | tenancy. Both branches must belong to it (composite FKs to `shops(id, org_id)`) |
| `from_shop_id`, `to_shop_id` | `CHECK (from_shop_id <> to_shop_id)` |
| `status` enum | `IN_TRANSIT` → `RECEIVED` / `REJECTED` / `CANCELLED` (the escrow states) |
| `sent_by_id`, `received_by_id` | person keys (owner or custodian) |
| `from_custody_id`, `to_custody_id` | the custody it left / landed in, null when it went off/onto the unassigned shelf |
| `note`, `rejection_reason` | |
| `total_value` decimal(14,4) | sum of the lines, at cost |
| `sent_at`, `answered_at`, timestamps | |

### 3.2 `branch_transfer_items`
Each line is a product, and each **lot draw** inside it is kept, because escrow
needs to know exactly which shelf rows to give back on a reject:

- `branch_transfer_items`: `transfer_id`, `product_name` (lowercased, rule 6),
  `variant_id`, `group_id`, `quantity`,
  `unit_cost` (weighted average of the draws), `pieces_per_carton`.
- `branch_transfer_lot_draws`: `item_id`, `inventory_entry_id` (A's lot),
  `quantity`, `unit_cost`, `source` (SUPPLIER/PERSONAL).

**Escrow is the transfer row itself.** Sending decrements A's lots and records the
draws. Nothing is created at B until accept. This means:
- no stock query anywhere needs a new "in transit" filter. A's shelf simply has less,
  and B's has nothing yet;
- reject/cancel restore `quantity_remaining` on the exact lots drawn, the same
  way sale rejection restores stock today;
- "in transit" figures come from `branch_transfers WHERE status = 'IN_TRANSIT'`.

### 3.3 Inter-branch ledger
- `branch_balances`: `org_id`, `creditor_shop_id` (A), `debtor_shop_id` (B),
  `total_given`, `total_paid`, `outstanding` (decimal 14,4),
  `UNIQUE (org_id, creditor_shop_id, debtor_shop_id)`. One balance per branch pair,
  upserted on every accept (the same idea as rule 3).
- `branch_payments`: `org_id`, `balance_id`, `from_shop_id`, `to_shop_id`, `amount`,
  `currency` (USD/FC), `amount_usd`, `usd_to_fc_rate_snapshot`, `status`
  (`PENDING`/`CONFIRMED`/`REJECTED`), `paid_by_id`, `confirmed_by_id`, `note`.

### 3.4 Small additions
- `inventory_entries.branch_transfer_id` (nullable): stamped on the lot created at B,
  so B can trace where it came from.
- `StockMovementReason`: `TRANSFER_OUT` (on send), `TRANSFER_IN` (on accept),
  `TRANSFER_RETURN_IN` (on reject/cancel, back at A).
- Register the new entities in both `app.module.ts` and `database/database.config.ts`.

## 4. Flows

All of these are online only. Each runs in one DB transaction (rule 4).

### 4.1 Send: `POST /branch-transfers`
`{ toShopId, items: [{ productName, variantId?, quantity }], note? }`
- The acting branch is A (from `X-Shop-Id`). Refused under the `all` scope (existing rule).
- Actor must be the owner, or the custodian of A's OPEN custody.
- Stock is drawn from: the custodian's own volume when the custodian sends; the unassigned
  shelf (`custodian_id IS NULL`) when the owner sends (see Q4). SUPPLIER-first
  (rule 2), then oldest first. 400 with the available count if it's short.
- Lots are decremented, draws recorded, `TRANSFER_OUT` movements written, and the status is `IN_TRANSIT`.
- Push notification to B's owner and custodian.

### 4.2 Receive: `PATCH /branch-transfers/:id/receive`
No body. **All or nothing**: B either receives every line in full or rejects the whole transfer (§8 Q2). There is no partial receipt and nothing goes missing in transit.
- Actor must be the owner, or the custodian of **B's** OPEN custody, acting at B.
- For each line, one new lot is created at B:
  - `unit_cost` is carried from the draws, so B's margins stay true;
  - `source` mirrors the draw, so rule 2 still applies at B;
  - `supplier_debt_id` is null, because A's debt to an outside supplier stays with A;
  - `custodian_id` is set to B's custodian when the custodian received it, so the goods sit in their volume and count in their next handover (§8 Q4). When the owner receives, the goods go on the unassigned shelf.
- If B has no `product_prices` row for the product, A's selling price is copied, so the
  product is sellable straight away. If B has no product group or variant for a sized
  product, it is created by name/label.
- `branch_balances` is upserted: `+ total_value` (Σ quantity × unit_cost).

### 4.3 Reject: `PATCH /branch-transfers/:id/reject`
`{ reason }`. B's owner or custodian. Every draw is restored to its original lot
(`TRANSFER_RETURN_IN`). There is no ledger effect.

### 4.4 Cancel: `PATCH /branch-transfers/:id/cancel`
A's owner or custodian, only while `IN_TRANSIT`. It has the same effect as a reject.

### 4.5 Pay back
- `POST /branch-transfers/payments`: B's owner or custodian, `{ toShopId, amount, currency }`.
  It can't exceed `outstanding`, and only one PENDING payment is allowed per pair (as `paySupplier` does today).
- `PATCH /branch-transfers/payments/:id/confirm` | `/reject`: A's owner or custodian
  confirms the cash arrived. The balance decreases on confirm.
- **Owner shortcut:** when the owner records the payment, it is confirmed immediately, because
  the owner can't cheat themselves. This mirrors the custody decision on the owner's own sales.

## 5. Money and cash

- **Value = cost.** Moving stock inside one business creates no profit. A's
  `totalProfit` is unaffected by a transfer, and B's profit on a later sale is
  `sale − carried unit_cost`. This is correct for the business as a whole.
- **Cash position per branch** (`dashboard.service.getCashPosition`) gains two terms:
  ```
  availableBusinessCash += branchPaymentsInCash − branchPaymentsOutCash
  ```
  Neither term goes into profit, so expense caps (`availableProfitCash`) don't move.
  Under **All branches** the two terms cancel. Exclude both to keep the org figure clean.
- **Currency:** the exchange rate is per business (migration 037), so both branches share one rate.
  An FC payment gives `amount_usd = amount / systemRate`. A USD payment follows the cash model
  (FC drained at the Current Market Rate, booked at System Rate), same as expenses and withdrawals.
- No JS `number` for money. Use `decimal.js` and `.toFixed(4)` everywhere (rule 5).

## 6. Rules this touches

- **Rule 8 (rename):** block renaming a product while an `IN_TRANSIT` transfer
  contains it (409). Otherwise B would receive the old name.
- **Custody:** a custody can't close while it has an `IN_TRANSIT` transfer in or
  out (409 `OPEN_TRANSFER`), and goods received into a custody count in that custodian's next handover.
- **Branch archive/delete:** refused while the branch has a transfer in transit or a non-zero `branch_balances`.
- **Ownership transfer:** `branch_*` rows are tenancy-keyed on `org_id` only (no
  `owner_id`), so they move with the business. There is nothing to rehome.
- **Alerts:** `incoming_branch_transfer` (B has something to verify) and
  `pending_branch_payment` (A has a payment to confirm) on `GET /dashboard/alerts`.

## 7. Phases

1. **API core.** Entities, migration 041, send/receive/reject/cancel with escrow,
   stock movements, permission guard (owner or OPEN custodian at that branch),
   EN/FR i18n for every new error.
2. **API ledger.** Balances, payments, cash position terms, alerts, the rename and
   custody-close guards.
3. **Dashboard.** "Transfer stock" dialog from a branch (pick destination, products,
   quantities), Outgoing / Incoming / In transit tabs, a receive screen with per-line
   received qty, a branch balances page with pay/confirm. Hidden when the business has one branch.
4. **Mobile.** Receive and send screens for owner and custodian. Disabled with a
   "needs internet" hint when offline. Nothing goes into the offline queue. Push notifications.
5. **QA against a real DB** (mocked repos miss tenancy bugs). Matrix:
   - send → receive in full;
   - send → reject → lots restored exactly;
   - cancel;
   - custodian-to-custodian;
   - an employee who isn't the custodian is refused (403);
   - the wrong branch tries to receive (403);
   - an attempt to sell escrowed stock at A fails;
   - pay, confirm and reject payment;
   - cash position at A and B before and after, and the org-wide figure unchanged;
   - rename blocked while in transit;
   - sized product into a branch with no group;
   - a mini holding stock at A is untouched.

## 8. Decisions (settled 2026-11-11)

1. **Value of the debt = cost.** B owes A the carried unit cost. There is no internal profit and no transfer price.
2. **Receive all or reject all.** There is no partial receipt and no lost-in-transit.
3. **Branch without a custodian:** only the owner can send or receive there.
4. **Custody on arrival:** goods received by B's custodian land in their custody
   volume. Goods sent by A's custodian come out of their volume. When the owner acts,
   the unassigned shelf is used.
5. **Owner-recorded payments confirm immediately.** A custodian's payment waits for
   the other branch's owner or custodian to confirm it.
6. **Same business only in v1.** Cross-business stays on the existing consignment.

## 9. Build notes (2026-11-11)

- The API has no server push (the mobile app polls), so "notify B" is the
  `incoming_branch_transfer` / `pending_branch_payment` alerts, shown only to the
  owner and the branch's custodian.
- Controller gate: `@RequiresService('custody.manage', 'custody.hold')` (any-of).
  The service then checks that the custody is at *this* branch.
- Live QA script: session scratchpad `qa-branch-transfers.mjs` (65 checks: escrow,
  SUPPLIER-first across lots, exact-lot restore, cancel, 403s for the wrong branch,
  non-custodians and other employees, rename/archive/handover guards, payments
  USD/FC, cash position deltas, custodian volume in and out, a sized product into
  a branch with no group).
- Found while testing, pre-existing and not changed: adding PERSONAL stock of a
  product that already exists merges into the one lot and overwrites its unit cost.
- Found while reading, pre-existing and not changed: `availableBusinessCash` does
  not subtract payments made to outside suppliers.

### Clients (2026-11-11)

- **Dashboard** `app/(main)/branch-transfers/`: Incoming / Outgoing / Balances & payments
  tabs, a send dialog (the owner picks from shelf products and per-size variants, a
  custodian from their custody volume), a detail modal (receive everything, reject with
  a reason, cancel), a pay dialog (FC or USD), and confirm/reject on incoming payments.
  Read-only under "All branches". The sidebar entry shows for the owner once there are
  2+ branches, and for the custodian. Dashboard alerts link to it.
- **Mobile** `app/branch-transfers.tsx` with `SendBranchTransferModal` and
  `PayBranchModal` (FC only). A home tile carries a badge counting what waits on the
  branch. Every action is disabled with a banner while offline or in manual offline
  mode. Nothing touches the offline queue.
- **Custody handovers** now seal `branch_paid_out_fc` / `branch_received_fc`
  (migration 042). The owner's handover breakdown and both custodian screens show them.
