# Running the App Locally

This guide walks you through running all three apps — **API**, **Mobile**, and **Web Dashboard** — on your machine and testing them end-to-end as a user.

---

## Prerequisites

Make sure the following are installed before you start:

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 20 | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| PostgreSQL | ≥ 14 | `psql --version` |
| Expo Go app | latest | Install on your phone from the App Store / Play Store |

---

## 1. Install Dependencies

From the **monorepo root**:

```bash
cd /path/to/e-commerce-app
pnpm install
```

---

## 2. Set Up the Database

### Create the database

```bash
psql -U postgres -c "CREATE DATABASE trading_app;"
```

If your local PostgreSQL uses a different username or password, adjust accordingly.

### Configure environment variables

The API already has a default `.env` at `apps/api/.env`. Open it and confirm:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/trading_app
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
```

Change `postgres:password` to match your local PostgreSQL credentials if needed.

### Run migrations (auto-sync)

Because `NODE_ENV=development`, TypeORM will **automatically create all tables** the first time the API starts. No manual migration step is needed.

---

## 3. Start the API

Open a terminal and run:

```bash
pnpm dev:api
```

You should see:

```
[Nest] LOG [NestApplication] Nest application successfully started
[Nest] Application is running on: http://localhost:3000
```

**Verify it works:** Open [http://localhost:3000/api/docs](http://localhost:3000/api/docs) in your browser — you should see the Swagger UI with all endpoints documented.

---

## 4. Start the Web Dashboard

Open a **second terminal**:

```bash
pnpm dev:dashboard
```

The dashboard runs at **[http://localhost:3001](http://localhost:3001)**.

> It will redirect automatically to `/login`.

---

## 5. Start the Mobile App

Open a **third terminal**:

```bash
pnpm dev:mobile
```

A QR code will appear in the terminal. Scan it with the **Expo Go** app on your phone.

### Connecting mobile to your local API

The mobile app defaults to `http://localhost:3000/api`. This works on iOS simulators and Android emulators but **not on a real device** (your phone can't reach `localhost` on your Mac).

For a real device, create `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000/api
```

Find your local IP with `ipconfig getifaddr en0` (Mac) or `hostname -I` (Linux). Make sure your phone and Mac are on the same Wi-Fi network.

---

## 6. End-to-End Test Walkthrough

Run through these scenarios to verify everything works correctly.

### 6.1 Register two users

You need at least **two accounts** to test supplier/debtor flows.

**On the mobile app** (or via Swagger at `/api/docs`):

Register **User A** (the trader/owner):
- Username: `alice`
- Email: `alice@test.com`
- Password: `password123`

Register **User B** (a supplier/debtor):
- Username: `bob`
- Email: `bob@test.com`
- Password: `password123`

Log in as **Alice** on the mobile app and on the web dashboard.

---

### 6.2 Add personal inventory

As **Alice**, tap the **+** button on the Inventory tab and choose **Add Personal Product**:

| Field | Value |
|-------|-------|
| Product Name | Rice 50kg |
| Unit Cost | 20.00 |
| Selling Price | 30.00 |
| Quantity | 100 |
| Category | Grains |

Check the Inventory tab — you should see "Rice 50kg" with a **Personal** badge.

---

### 6.3 Receive stock from a supplier (Bob)

Still as **Alice**, tap **+** → **Receive from Supplier**:

- Search for `bob` → select him
- Product Name: `Rice 50kg`
- Agreed Unit Cost: `22.00`
- Selling Price: `32.00`
- Quantity: `50`

**What to verify:**
- Inventory now shows a second "Rice 50kg" entry with a **Supplier** badge (Bob's stock)
- Network tab → **Suppliers** shows Bob with an outstanding balance of **$1,100.00** (50 × $22)
- Web dashboard → Suppliers list shows the same

---

### 6.4 Record a sale (normal)

On the Inventory tab, **long-press** the Supplier "Rice 50kg" entry → **Record Sale**:

| Field | Value |
|-------|-------|
| Quantity Sold | 5 |
| Sale Price per Unit | 32.00 |

**What to verify:**
- Supplier stock deducted first (Bob's entry goes from 50 → 45)
- Sales tab shows a new entry with **+$50.00** profit badge (5 × ($32 - $22))
- Dashboard profit increases

---

### 6.5 Test the price guard (sell below cost)

Record another sale with a price **below cost**:

| Field | Value |
|-------|-------|
| Product Name | Rice 50kg |
| Quantity Sold | 2 |
| Sale Price per Unit | 19.00 |

**What to verify:**
- A **red warning screen** appears: "Selling Below Cost!"
- It shows the estimated loss amount
- Tap **Go Back** to cancel — no sale recorded
- Tap **Sell at a Loss (confirm)** — sale records with a red **Loss** badge in sales history

---

### 6.6 Consign stock to a debtor (Bob)

On the Inventory tab, tap **+** → **Consign to Debtor**:

- Search for `bob` → select him
- Product Name: `Rice 50kg`
- Quantity: `10`
- Agreed Price per Unit: `28.00`

**What to verify:**
- A new **Consigned** inventory entry appears
- Network tab → **Debtors** shows Bob owes **$280.00** (10 × $28)
- Bob's debtor detail screen shows the consigned product

---

### 6.7 Record a payment to a supplier

Network tab → tap **Bob** in Suppliers → tap **Pay**:

- Amount: `500.00`
- Note: `partial payment`

**What to verify:**
- Bob's outstanding balance drops from $1,100.00 → $600.00
- The payment appears in the Payments history with the running balance

---

### 6.8 Record a payment from a debtor

Network tab → tap **Bob** in Debtors → tap **Record Payment**:

- Amount: `100.00`
- Note: `first instalment`

**What to verify:**
- Bob's debtor balance drops from $280.00 → $180.00
- Dashboard net position updates

---

### 6.9 Check the web dashboard

Go to **[http://localhost:3001/dashboard](http://localhost:3001/dashboard)**:

- KPI cards show updated totals
- Charts render (Top Products bar chart, Source Pie chart)
- Recent sales table shows Alice's sales
- Navigate to **Inventory**, **Suppliers**, **Debtors**, **Sales** pages — all data should match mobile

---

### 6.10 Test alerts (optional)

To trigger the overdue debtor alert without waiting 30 days, temporarily update the `OVERDUE_DAYS` constant in `apps/api/src/common/constants.ts` to `0`, restart the API, then reload the dashboard. The red overdue banner should appear.

Similarly, to test low-stock alerts, set a product's quantity to ≤ 5 via the API or reduce it through sales.

---

## Quick Reference

| App | URL / Command | Port |
|-----|--------------|------|
| API | `pnpm dev:api` | 3000 |
| Swagger docs | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | 3000 |
| Web Dashboard | `pnpm dev:dashboard` → [http://localhost:3001](http://localhost:3001) | 3001 |
| Mobile | `pnpm dev:mobile` → scan QR with Expo Go | — |

### Useful Swagger endpoints to test directly

All require the JWT Bearer token from `POST /api/auth/login`:

- `GET /api/dashboard` — financial summary
- `GET /api/dashboard/alerts` — current alerts
- `GET /api/inventory` — all inventory entries
- `GET /api/sales/top-products?rankBy=profit&period=30d` — top products

---

## Troubleshooting

**API won't start — "password authentication failed"**
→ Update `DATABASE_URL` in `apps/api/.env` with your Postgres credentials.

**Mobile shows "Network Error"**
→ On a real device, set `EXPO_PUBLIC_API_URL` to your machine's local IP (not `localhost`).

**Tables not created**
→ Confirm `NODE_ENV=development` in `.env`. TypeORM `synchronize: true` only runs in dev mode.

**Dashboard shows blank page**
→ Make sure the API is running first. The dashboard is client-side only — all data comes from the API.

**Expo Go says "Something went wrong"**
→ Run `pnpm dev:mobile` again and re-scan the QR code. Also check that `global.css` exists in `apps/mobile/`.
