# Mobile App — Plan & Play Store Roadmap

Living document for what's shipped, what's blocking a Play Store listing, and the
backlog of features to bring across from the dashboard. Update as items move.

> Branding: app is **KMB-Talk** (`app.json:name`). Android package: `com.kmb.mobile`.
> iOS bundle: `com.kmb.mobile`. Slug: `trading-app`. EAS project:
> `e13f95c5-e462-4ab6-9fc7-6beb8a1946f5`.

## Status snapshot

A signed APK has been built locally and sideloaded on a physical device — the
core flows work end-to-end. The mobile app currently delivers:

- **Five-tab shell** — Home (KPIs + alerts), Inventory, Network (suppliers +
  debtors), Sales (history + top products), Consignments.
- **Auth + secure token storage** (SecureStore).
- **Inventory operations** — add personal stock, receive from supplier,
  consign to debtor, long-press quick-sell.
- **Sales flow** with price-guard 422 handling + override.
- **Payment recording** to suppliers and from debtors.
- **External contacts** — create, list, record product in/out, payment in/out.
- **Salary** — recipient-side confirm/reject of incoming payments.
- **Offline-mode snapshot + queued sales sync** when connectivity returns.
- **i18n** EN/FR with locale store, **dark mode**, **dual currency** (USD/FC
  with system-rate display and 0dp FC formatting).
- **Push notifications** for overdue debtors, low stock, pending consignments.
- **Global error boundary** — uncaught render exceptions show a recovery screen
  with the error, component stack, and app version (selectable for bug reports).
- **App version footer** on the home tab.

## Pre-launch blockers (require operational input)

These can't be solved by code alone — they need either a credential, a hosted
asset, or store-listing copy. None block development but all must be cleared
before submitting to the Play Console.

| # | Item | What's needed |
|---|------|---------------|
| 1 | **Production upload key** | Run `eas credentials` from `apps/mobile/` and let EAS generate + store an upload key. No keystore file in the repo; debug keystore in `android/app/build.gradle:101-106` is fine for local builds only. |
| 2 | **Google Play service account JSON** | Create a service account in Google Cloud Console with Play Console publishing rights. Download the JSON, save as `apps/mobile/play-store-service-account.json` (already gitignored). Referenced by `eas.json → submit.production.android.serviceAccountKeyPath`. |
| 3 | **Privacy policy URL** | Host one (a Notion page is enough to start). Add to `app.json` and the Play Console listing. |
| 4 | **Store listing copy** | Short description (≤ 80 chars), full description (≤ 4,000 chars), app category, content rating questionnaire answers. |
| 5 | **Store graphics** | App icon 512×512 (already in `assets/icon.png` — verify dimensions), feature graphic 1,024×500, at least 2 phone screenshots ≥ 320px short side. |
| 6 | **Contact email** for Play Console support listing. |
| 7 | ~~**In-app account deletion**~~ — DONE. Edit profile + change password + soft-delete-with-7-day-grace flow shipped. See `apps/mobile/app/account/` and `apps/api/src/users/`. Privacy-policy URL (blocker #3) still needed for the Play Console listing. |

## Code-level launch readiness — done

| Item | Where |
|------|-------|
| applicationId aligned to `com.kmb.mobile` | `android/app/build.gradle`, MainActivity.kt, MainApplication.kt |
| `app_name` Android resource set to `KMB-Talk` | `android/app/src/main/res/values/strings.xml` |
| Auto-increment versionCode on every production build | `eas.json → cli.appVersionSource: "remote"` + `build.production.autoIncrement: true` |
| Persona switch (Self / Employer @X) | `store/persona.store.ts`, `lib/api.ts` interceptor sets `X-Acting-As`, `components/ui/PersonaSwitcher.tsx` + `PersonaBanner.tsx` on all 5 tabs |
| Bluetooth thermal printer (ESC/POS, 58 mm) | `lib/escpos.ts` (encoder), `lib/bluetooth-printer.ts` (RFCOMM client), `store/printer.store.ts`, `app/account/printer.tsx`. `printReceipt()` tries paired BT printer first, falls back to system print dialog. **Requires running `pnpm install` + `expo prebuild --clean` once before the next APK rebuild** (added `react-native-bluetooth-classic` native module). |
| EAS submit config skeleton | `eas.json → submit.production.android` (track: `internal`, releaseStatus: `draft`) |
| Service account JSON gitignored | `.gitignore` |
| Global error boundary | `components/ui/ErrorBoundary.tsx`, wired in `app/_layout.tsx` |
| App version footer | bottom of `app/(tabs)/index.tsx` |
| Production API URL in EAS env | `eas.json → build.{preview,production}.android.env.EXPO_PUBLIC_API_URL` |
| Account edit + soft-delete (Play User Data policy) | `apps/mobile/app/account/`, `apps/api/src/users/`, migration `1000000000007-AddUserSoftDelete.ts` — 7-day grace window, hourly anonymization sweep, login surfaces a restore prompt during grace |

## Should-fix before first public listing

Not blockers but you'll regret skipping:

- **Crash reporting** — no production app should ship blind. Wire
  `sentry-expo` with `EXPO_PUBLIC_SENTRY_DSN`. ~30 min of work.
- **Client-side validation in mutation modals** — `RecordSaleModal`,
  `RecordDebtorPaymentModal`, `ConsignToDebtorModal`, etc. currently rely
  entirely on server-side validation. Add required/positive-number checks for
  instant feedback.
- **Offline-mode regression test** — manual: record 5 sales offline, kill the
  app mid-sync, restart, watch sync **resume** and complete (no duplicate
  sales). If it fails, fix before launch. Document the verified flow at the
  bottom of `apps/mobile/CLAUDE.md`.
- ~~**Existing TS error in `app/(tabs)/index.tsx`**~~ — DONE. `StatCard` now
  accepts an optional `className`; `pnpm tsc --noEmit` is clean.

### Offline sync hardening — DONE

Sync now survives poor connectivity and never double-records a sale:

- **Idempotency** — each queued sale carries a stable `clientSaleId` (its queue
  id). The API (`POST /sales`) dedupes on `(owner_id, client_sale_id)`: a sale
  the server committed but whose response was lost on a flaky link is matched on
  retry and returned, not duplicated. Migration `1000000000009-AddClientSaleIdToSales.ts`.
- **Retry/backoff** — `lib/sync.ts` retries each sale up to 4× with exponential
  backoff + jitter on network/timeout/5xx/429 errors; permanent 4xx rejections
  surface immediately. Per-request timeout bumped to 45s (vs the global 10s) for
  slow links.
- **Resume** — synced rows are removed from the persisted queue **incrementally**,
  so an app kill mid-sync resumes exactly where it stopped.
- **Progress UI** — the home-tab sync banner shows a real progress bar + `X / Y
  synced · NN%`. After a partial failure it offers **Resume** (continue the rest)
  and **Restart** (retry all remaining, skipping the already-synced).

## Missing features — roadmap

Ordered by recommended sequence. The dashboard already implements all of these;
porting them is mostly UI + API-client wiring.

### Sprint 1 — finance management (highest day-to-day value)

**Status**: Expenses shipped. Withdrawals deliberately scoped to web only.

#### ~~Expenses~~ — DONE

Shipped:
- `apps/mobile/app/expenses.tsx`: total card (FC at buying rate), period chips (today/week/month/last-7d/all), category chips, by-category breakdown, paginated list, long-press to delete.
- `apps/mobile/components/forms/AddExpenseModal.tsx`: amount + USD/FC currency toggle, category pills, date input, description, **buying-rate warning banner** ("⚠ spending $X will drain ≈ Y FC from the till") shown when USD is selected and a buying rate is configured. Backend cap errors surface verbatim via `getErrorMessage`.
- `apps/mobile/lib/api.ts`: `expensesApi.list / create / delete`, `dashboardApi.cashPosition` (new), `currencyApi.getRate` extended with `sellingRate`. Types: `Expense`, `ExpenseListResponse`, `ExpenseListParams`, `ExpenseCategory`, `ExpenseCurrency`, `ExpensePeriod`.
- `QK.expenses(params)` + `QK.cashPosition` in `query-keys.ts`.
- Entry tile on the home tab (between profit and Top Suppliers).
- FC display only — mobile has no USD/FC toggle. The dashboard's `fmtExpenseUsdAtBuyingRate` was simplified to "FC only at the buying rate" for mobile.

Note: **Withdrawals stay web-only** by product decision — owner-side administration.

#### Withdrawals — web-only (administration surface)

Decision: withdrawals remain on the dashboard only. Withdrawing cash is an owner-administration action, not a day-to-day mobile flow. The dashboard's full implementation (`apps/dashboard/app/(main)/withdrawals/page.tsx`) already covers it.

### Sprint 2 — control surfaces

#### Settings

There's no Settings screen on mobile today — system rate, buying rate, theme,
locale, and display currency are scattered across the home header. Consolidate.

- New `app/settings.tsx` route reachable from a gear icon in the home header.
- Surface the **inverted-rate alert** banner when `usdToFcRate < sellingRate`
  (same condition the API already exposes in `/dashboard/alerts`).
- Owner-only screen — guard with `useAuthStore` to read the user's role.

#### ~~Account management (edit + delete)~~ — DONE in v1.0.0

Shipped:
- `app/account/index.tsx`, `edit.tsx`, `change-password.tsx`, `delete.tsx` reachable from a 👤 icon in the home header.
- Backend: `PATCH /users/me`, `PATCH /users/me/password`, `DELETE /users/me`, `POST /auth/restore`. Login returns **410** when the user is inside their 7-day grace window; mobile shows a restore prompt.
- Soft-delete: `deleted_at` and `anonymized_at` columns on `users`. A background sweep (hourly + on every boot, in `UsersService.purgeExpiredAccounts`) anonymizes accounts past grace: username becomes `deleted_user_<short_id>`, email/phone/name/dateOfBirth/role cleared, password hash replaced with random unguessable value. Transactional history stays intact for counterparties.
- JWT auth rejects tokens for users with `deletedAt`/`anonymizedAt` set, forcing a fresh login (which routes them through the restore prompt).

Still outstanding for full Play compliance:
- **Web mirror** — add `/account/delete` on the dashboard so the Play Console listing has a public deletion URL.
- **Privacy-policy URL** still listed under operational blocker #3.

#### Pricing (standard product prices)

- **Backend**: complete — `apps/api/src/pricing/`.
- **Mobile API client**: missing — add `pricingApi.list / upsert / update /
  delete` + `ProductPrice` type.
- **Screen**: new `app/pricing.tsx` with the product autocomplete pattern from
  `ConsignToDebtorModal`.

### Sprint 3 — visibility

#### Activity log

- **Backend**: complete — `apps/api/src/activity-logs/`.
- **Mobile API client**: missing — add `activityLogsApi.list` + the
  `ACTIVITY_LOG_TYPES` enum + `ActivityLogEntry` type.
- **Screen**: new `app/activity.tsx`. Filterable feed (action type, actor,
  date range). Display-only — no mutations.

#### Inventory movements per product

- **Backend**: complete — `stockMovementsApi.byEntry` already wired in
  `apps/mobile/lib/api.ts`.
- **Screen**: missing. Add a "Movement history" tab on `app/product/[name].tsx`
  showing every PURCHASE / SALE / RETURN / ADJUSTMENT / CONSIGN / EXPIRY entry
  per product.

### Sprint 4 — employer payroll — DESCOPED on mobile (web-only by decision)

**Paying employees stays on the dashboard only.** Like withdrawals, payroll
administration (roster CRUD, mini-employee pairing, salary setting, initiating a
salary payment) is an owner-administration action, not a day-to-day mobile flow.
The dashboard's full employee CRUD (`apps/dashboard/app/(main)/employees/`) covers it.

**Mobile is recipient-only and already shipped** (`app/salary.tsx`): an employee
sees their monthly salary summary (target / collected / pending / remaining),
sees whether each payment is paid, and **confirms or rejects** each incoming
payment as proof they truly received the cash. The home tab also surfaces a
"salary payments to confirm" banner. No employer-side payment UI on mobile.

Not building on mobile: employee roster, salary setting, pay-salary. (The
employer-side endpoints in `employmentsApi` + `salaryPaymentsApi` remain
dashboard-only.)

## Suggested release cadence

1. **v1.0.0** — current APK + operational blockers cleared **+ account
   edit/delete flow** (policy-required). Submit to Play Console's internal
   testing track for closed beta with a handful of users.
2. **v1.1.0** — Expenses + Withdrawals + Settings consolidation (Sprint 1 + 2).
3. **v1.2.0** — Pricing + Activity log + Inventory movements (Sprint 2 + 3).
4. **v1.3.0** — Employer payroll (Sprint 4).

Each release bumps `app.json → expo.version`. `runtimeVersion.policy:
"appVersion"` is already set so OTA updates target the matching native build.

## Local build & test cycle

See the "Quick start" section near the bottom of `apps/mobile/CLAUDE.md`. The
hot-path command from the repo root for a full local build is:

```bash
cd apps/mobile
rm -rf android/app/build android/build android/.gradle
pnpm android
```

**After adding a native module (one-time):**

```bash
cd apps/mobile
pnpm install                        # picks up react-native-bluetooth-classic
pnpm prebuild                       # regenerates android/ with BT permissions
pnpm android                        # rebuild the APK
```

For a Play-Store-grade preview APK signed by the EAS upload key:

```bash
eas build --platform android --profile preview --local
adb install build-*.apk
```

If you hit a Gradle "command 'node'" failure on a fresh shell, that's the
nvm + Gradle PATH issue — fix by symlinking Node into `/usr/local/bin`:

```bash
sudo ln -sf "$(which node)" /usr/local/bin/node
```
