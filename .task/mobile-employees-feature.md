# Task — Mobile: Employees feature

**Status:** deferred. Backend + dashboard land first (see [`/PLAN.md`](../PLAN.md)). Pick this up once Phases 1–7 (backend) and A–B (dashboard hire flow + pricing) are merged so there's something to integrate against.

## Context

Two tiers of employee:

| Tier | Mobile auth | Permitted actions |
|------|-------------|-------------------|
| `FULL` | Standard login (existing flow) | direct sales, send consignments, give to external contacts, accept debtor payments, register external-contact payments, register expenses |
| `SALES_ONLY` (mini) | Pairing code (no email/password) | direct sales only |

When an employee has an `ACTIVE` (or `TERMINATION_REQUESTED`) employment, all permitted mutations route to the employer's books server-side. The mobile app's job is to (a) reflect that visually, (b) restrict navigation to the permitted set, and (c) handle the new pairing + discount-reason flows.

## Deliverables

### 1. Mini-employee pairing flow
- New screen accessible from `/login` (e.g., "I have a pairing code"): inputs the one-time pairing code shown to the employer in the dashboard.
- Calls `POST /auth/pair-mini-employee` (endpoint TBD in backend), receives JWT, stores in SecureStore like the regular login.
- After pairing, the user lands directly in a restricted home screen (see #3).

### 2. "Acting on behalf of {employer}" banner
- Persistent banner at the top of the tab navigator whenever `auth.activeEmployment` is set.
- Tap → opens employment detail screen (status, tier, request-termination button, history).
- Color/style indicates state: ACTIVE = neutral, TERMINATION_REQUESTED = warning.

### 3. Restricted navigation by tier
- **`OWNER`** (no employment): existing app, unchanged.
- **`FULL_EMPLOYEE`**: hide tabs/screens for inventory receive flows, supplier-debt management, employee management, settings sections that mutate owner state. Show: home (limited), sales, consignments, debtors, external-contacts, expenses.
- **`MINI_EMPLOYEE`**: only direct-sale screen. Bottom tab bar hidden or single-item. Logout/settings remain accessible.

### 4. Employment requests inbox (FULL employees)
- New screen `app/employment-requests.tsx`: list of `PENDING` employments where the user is the employee. Accept / reject buttons.
- Push notification on receipt → deep link into this screen.
- Termination requests received from the employer also surface here for approval.

### 5. Discount reason modal
- When a `FULL_EMPLOYEE` submits a sale/consignment/external-give and the unit price is below the owner's standard, the API rejects with `422 { error: 'discount_reason_required', standardPrice }`.
- Mobile catches that error, opens a modal: "You're discounting from {standardPrice}. Reason?" (free text), then re-submits with `discountReason` set.
- If the API caps the price (`priceCapped: true`), show a non-blocking toast: "Price capped at {standardPrice}".
- Reuse the existing price-guard handling pattern in `RecordSaleModal.tsx` (`isPriceGuardWarning`/`getPriceGuardWarning` from `lib/utils.ts`) — extend with `isDiscountReasonRequired` / `getDiscountReasonInfo` helpers.

### 6. Auth store extension
- `store/auth.store.ts` adds `activeEmployment: { id, tier, employer: { id, name } } | null`.
- Fetched at login, on app foreground, and on a 5-min interval while active.
- Drives banner visibility, tab restrictions, and "acting as" labelling.

### 7. Settings — leave employment
- Settings screen (for employees) shows current employment info.
- "Request termination" button → `PATCH /employments/:id/request-termination`.
- After termination is approved by the counterparty, app returns to its normal owner state on next refresh.

## Risks / edge cases

- **Offline sync queue** — mutations queued offline by an employee must include the actor context in the request. Server resolves `effectiveOwnerId` from the JWT, so as long as the JWT belongs to the employee at sync time, owner routing works automatically. But if the employment terminated between queue and replay, the queued mutation will fail — surface that to the user clearly rather than silently dropping.
- **Tier transition mid-session** — if employer terminates while the employee app is running, next API response will indicate "no active employment"; app must invalidate cached data scoped to the employer's books.
- **Mini-employee SecureStore** — pairing code grants a JWT; treat it like any other token. Document how to "re-pair" if a mini employee loses their phone (employer revokes via dashboard, generates a new pairing code).

## Acceptance criteria

- [ ] Mini employee enters pairing code, lands in restricted single-screen app, can record direct sales only.
- [ ] FULL employee logs in normally, sees banner, restricted tabs, can perform all 6 action types.
- [ ] Discount on outgoing-product action prompts modal, captures reason, re-submits successfully.
- [ ] Selling above standard price shows the "price capped" toast and proceeds.
- [ ] Employee can request termination from settings; receives confirmation when employer approves.
- [ ] Employer-initiated termination shows up in the requests inbox; employee approves → app reverts to owner state on refresh.
- [ ] Offline-queued employee mutations replay correctly when connection returns.

## Reference

- Backend plan: [`/PLAN.md`](../PLAN.md)
- Existing price-guard reference impl: `apps/mobile/components/forms/RecordSaleModal.tsx`
- Mobile-specific conventions: `apps/mobile/CLAUDE.md`
