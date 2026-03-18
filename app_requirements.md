# 📦 Inventory & Credit Trading App — Product Requirements Document (PRD)

> **Purpose:** This document defines the complete functional requirements for a mobile/web application that manages personal inventory, supplier-credit purchasing, peer-to-peer consignment/lending, sales tracking, and financial reconciliation.

---

## 1. Overview

This app serves small traders/resellers who:
- Purchase products personally or receive them on **credit from suppliers** (other users).
- **Lend/consign products** to other users (acting as a supplier themselves).
- Track **what they owe** and **what others owe them**.
- Monitor **sales, profits, and stock** per product and per relationship.

---

## 2. User Roles & Relationships

The app has a **single user type** but each user can occupy multiple roles simultaneously depending on context:

| Role | Description |
|------|-------------|
| **Owner** | The logged-in user (primary perspective) |
| **Supplier** | Another app user who gives the Owner products on credit |
| **Debtor** | Another app user who receives products on credit from the Owner |

> A user can be both a Supplier to the Owner and a Debtor to the Owner at the same time (for different products).

---

## 3. Core Entities

### 3.1 Product
Each product entry holds:
- `product_name`
- `unit_price` (cost price — what was paid or agreed to pay)
- `selling_price` (what the owner sells it for)
- `quantity`
- `source` → either `PERSONAL` or `SUPPLIER` (linked to a supplier user)
- `category` (optional)
- `date_added`

### 3.2 Inventory Entry Types

| Type | Description |
|------|-------------|
| **Personal Stock** | Products the Owner purchases themselves and enters manually |
| **Supplier Stock** | Products received from a Supplier user on credit (borrowed) |
| **Consigned Out** | Products the Owner gives to a Debtor user on credit |

### 3.3 Transaction
Covers all financial and stock movements:
- Sale, Payment (to supplier), Receipt (from debtor), Stock addition, Stock return

---

## 4. Functional Requirements

---

### 4.1 Product Management

#### 4.1.1 Add Personal Product
- Owner manually enters: product name, unit cost price, selling price, quantity.
- The product is tagged as `source: PERSONAL`.

#### 4.1.2 Receive Product from Supplier (Borrow/Credit)
- Owner selects an existing app user as **Supplier**.
- Enters: product name, unit cost price (agreed price to pay supplier), selling price, quantity received.
- The product is tagged as `source: SUPPLIER`, linked to the selected supplier user.
- The total value (`unit_cost × quantity`) is automatically added to the **balance owed to that Supplier**.
- A **debt record** is created/updated for that supplier.

#### 4.1.3 Give Product to Debtor (Consign/Lend)
- Owner selects an existing app user as **Debtor**.
- Selects a product from their inventory (Personal or Supplier stock) and enters quantity and agreed unit price.
- The product is tagged as `consigned_to: DEBTOR_USER`.
- The total value is added to the **balance owed by that Debtor** to the Owner.

---

### 4.2 Sales & Pricing Rules

#### 4.2.1 Selling Price Validation (Guard Rail)
- **Rule:** The app MUST warn/flag the Owner if they attempt to set or record a sale at a price **less than or equal to the unit cost price** of a product.
- The warning must clearly state the cost price and the potential loss.
- The Owner can override the warning but must explicitly confirm.

#### 4.2.2 Sales Priority Rule (Supplier Stock First)
- When the Owner has the **same product** in both Personal Stock and Supplier Stock, **Supplier Stock must be sold/deducted first** before Personal Stock is touched.
- "Same product" is determined by matching `product_name` (case-insensitive) — or by explicit product linking.
- This priority is enforced automatically during sales recording and must be visible to the user.

#### 4.2.3 Recording a Sale
- Owner selects product, enters quantity sold and sale price.
- System checks pricing guard rail (4.2.1) and stock priority (4.2.2).
- Stock is decremented accordingly.
- Profit for that sale is calculated: `(sale_price - unit_cost) × qty_sold`.
- The sale is logged with: product, quantity, unit cost, sale price, profit, date, source (personal/supplier).

---

### 4.3 Payments & Debt Management

#### 4.3.1 Owner Pays Supplier
- Owner selects a Supplier and enters amount paid.
- The balance owed to that Supplier is **reduced** by the paid amount.
- A payment record is created with: supplier name, amount paid, **date of payment**, remaining balance.
- This record acts as an **acknowledgement** of payment.

#### 4.3.2 Debtor Pays Owner
- Owner selects a Debtor and enters amount received.
- The balance owed by that Debtor is **reduced** accordingly.
- A payment record is created with: debtor name, amount received, date, remaining balance.

#### 4.3.3 Partial & Installment Payments
- Both 4.3.1 and 4.3.2 support **partial payments** (installments over time).
- Full payment history per supplier/debtor must be viewable (list of all installments with dates).

---

## 5. Views & Dashboards

### 5.1 My Inventory Overview
- All products with: name, source (personal/supplier), unit cost, selling price, quantity remaining, total value.
- Filter by: source type, supplier, category.

### 5.2 Supplier Detail View
For a selected Supplier, show:
- **Products received** from this supplier: product name, unit cost, original quantity, quantity sold, quantity remaining, total value of remaining stock.
- **Total value sold** from this supplier's products (what has been liquidated).
- **Total amount owed** to this supplier (original credit minus payments made).
- **Payment history**: list of all payments made to this supplier with dates and amounts.
- **Running balance** after each payment.

### 5.3 Debtor Detail View
For a selected Debtor, show:
- Products consigned to this debtor: product name, unit price, quantity, total value.
- Total amount owed by this debtor.
- Payment history from this debtor with dates.
- Running balance.

### 5.4 Financial Summary Dashboard
| Metric | Description |
|--------|-------------|
| **Total I Owe** | Sum of all outstanding balances to all suppliers |
| **Total Owed to Me** | Sum of all outstanding balances from all debtors |
| **Net Position** | Total Owed to Me − Total I Owe |
| **Total Profit (All Time)** | Sum of profits across all sales |
| **Profit by Product** | Profit breakdown per product |
| **Profit by Supplier Source** | How much profit came from each supplier's products vs personal |

### 5.5 Top Sold Products
- Ranked list of products by: quantity sold, or total revenue, or total profit (toggle).
- Filterable by time period (today, this week, this month, custom range).

### 5.6 Sales History
- Full sales log: date, product, qty, cost price, sale price, profit, source.
- Filterable and searchable.

---

## 6. Notifications & Alerts

| Trigger | Alert |
|---------|-------|
| Setting sale price ≤ unit cost | ⚠️ "Selling below cost price! You will make a loss." |
| Recording a sale at a loss (confirmed override) | Log flagged with loss indicator |
| Supplier stock is running low | Optional low-stock notification |
| Debtor balance has been outstanding for X days | Optional overdue reminder |

---

## 7. User Management

- Users register/login via the app (email/phone + password or social login).
- Users can **search for other users** by username or phone to add as Supplier or Debtor.
- A user must **exist in the app** to be assigned as Supplier or Debtor (no external contacts).
- Users can see their own profile including: total debts, total credits, and transaction history.

---

## 8. Data Relationships (Simplified Schema)

```
User
 ├── PersonalProducts[]        (source: PERSONAL)
 ├── SupplierStockEntries[]     (source: SUPPLIER, linked to supplier_user_id)
 ├── ConsignedOutEntries[]      (linked to debtor_user_id)
 ├── SupplierDebts[]            (one per supplier: balance, payment history)
 ├── DebtorCredits[]            (one per debtor: balance, payment history)
 └── SalesTransactions[]        (linked to product, source, profit)

SupplierDebt
 ├── supplier_user_id
 ├── total_credit_received
 ├── total_paid
 ├── outstanding_balance
 └── Payments[] { amount, date, note }

SalesTransaction
 ├── product_id
 ├── source (PERSONAL | SUPPLIER)
 ├── supplier_user_id (if source = SUPPLIER)
 ├── qty_sold
 ├── unit_cost
 ├── sale_price
 ├── profit
 └── date
```

---

## 9. Business Logic Summary

1. **Receiving from supplier** → creates stock entry + increases debt to supplier.
2. **Selling** → decrements stock (supplier stock first if same product exists), logs profit.
3. **Consigning out** → transfers stock visibility, creates debt from debtor to owner.
4. **Owner pays supplier** → reduces owner's debt, logs payment with date.
5. **Debtor pays owner** → reduces debtor's debt, logs payment with date.
6. **Price guard** → always warn when selling at or below cost. Never silently allow a loss.

---

## 10. Out of Scope (Initial Version)

- Multi-currency support
- Barcode scanning
- Invoice/receipt generation (PDF)
- Third-party payment integrations
- Tax calculations

> These can be added in later versions.

---

## 11. Suggested Tech Stack (Optional Guidance for Builder)

| Layer | Suggestion |
|-------|-----------|
| Frontend | React Native (iOS + Android) or Flutter |
| Backend | Node.js / Django REST API |
| Database | PostgreSQL (relational — important for debt tracking) |
| Auth | Firebase Auth or JWT |
| Realtime sync | Firebase Firestore or WebSockets (for balance updates) |

---

*Document prepared for: AI-assisted application development.*
*Version: 1.0*
