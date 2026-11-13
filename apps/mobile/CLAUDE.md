# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> See the monorepo root `CLAUDE.md` for full conventions, business rules, and tech stack details. This file covers mobile-specific specifics only.

## Dev Commands

```bash
pnpm start        # expo start --dev-client
pnpm android      # react-native run-android
pnpm ios          # react-native run-ios
pnpm prebuild     # expo prebuild --clean (regenerate native dirs)
```

Run from the monorepo root for the full stack:
```bash
pnpm dev:mobile
```

## Architecture

### Routing
Expo Router with file-based routes. Auth guard lives in `app/_layout.tsx`: reads token from `SecureStore` → validates via `/auth/me` → redirects to `/(auth)/login` if missing/invalid, or `/(tabs)/` if valid.

```
app/
├── (auth)/          # login, register — no auth required
├── (tabs)/          # bottom-tab shell (index, inventory, network, sales)
├── supplier/[id].tsx
├── debtor/[id].tsx
└── consignments.tsx
```

### Data flow
- **React Query v5** for all server state (`QueryClient` in root layout, defaults: `retry: 1, staleTime: 30_000`)
- **Zustand** (`store/auth.store.ts`) for auth state only — token + `UserProfile`
- All API calls go through `lib/api.ts` — never call axios directly in components

### Key files
| File | Purpose |
|------|---------|
| `lib/api.ts` | Axios instance (JWT interceptor, 10s timeout) + typed API functions by domain |
| `lib/query-keys.ts` | `QK.*` factory — always use these for React Query keys |
| `lib/utils.ts` | `formatCurrency`, `formatDate`, `getErrorMessage`, `isPriceGuardWarning`, `getPriceGuardWarning` |
| `store/auth.store.ts` | `hydrate()` (app start), `login()`, `logout()` |
| `tailwind.config.js` | Custom color tokens: `primary`, `danger`, `success`, `warning`, `surface`, `card`, `border`, `muted`, `text` |

## Component Patterns

- `components/ui/` — primitives: `Button` (variants: primary/danger/ghost/outline), `Input`, `Card`, `Badge` (6 variants), `StatCard`, `EmptyState`
- `components/forms/` — full-screen modals for every mutation action
- `components/cards/` — domain cards (directory exists, currently empty)
- Use `className` (NativeWind) everywhere — no `StyleSheet.create`
- Path alias `@/*` maps to repo root (e.g., `@/lib/api`, `@/components/ui/Button`)

## Design system ("market ledger" — same identity as the public site)

- **Palette**: tokens in `global.css` (light + `.dark:root`), literals for native props in `lib/theme.ts` (`useBrand`). Paper/ink neutrals, `primary` = malachite, `accent` = copper (`brand-violet` is a legacy alias of copper). Never use raw Tailwind palettes (`bg-blue-50`, `text-amber-700`…) or `dark:` overrides — tokens flip on their own.
- **Type**: `font-display` (Fraunces SemiBold) for titles and big figures, `font-display-italic` for accents, `font-mono` / `font-mono-bold` (JetBrains Mono) for small uppercase labels and figures. Loaded in `app/_layout.tsx`. Never combine them with `font-bold`/`font-semibold` (Android falls back to the system font).
- **Icons**: `components/ui/Icon.tsx` (Feather). No emoji as icons.
- **Building blocks**: `Card` (+ `CARD_SHADOW`), `StatCard`, `Button` (pill; `primary|ink|danger|outline|ghost`, optional `icon`), `Badge`, `EmptyState`, `Input`, `ScreenHeader` (kicker + serif title, tab screens), `NavRow` (icon chip row), `ListFooter`. Native stack headers come from `useHeaderOptions()` — add it to any new nested Stack.
- Tab bar is custom (`app/(tabs)/_layout.tsx`), floating, with an animated active pill. Gradients/shadows use RN 0.83 `experimental_backgroundImage` / `boxShadow` (New Architecture) — no native gradient library, so design changes stay OTA-shippable.

## Price Guard (422 handling)

`RecordSaleModal` is the reference implementation. When a sale is submitted below cost:
1. API returns `422` with `{ warning: true, costPrice, potentialLoss, message }`
2. Detect with `isPriceGuardWarning(error)` from `lib/utils.ts`
3. Show warning `Alert` with the loss amount
4. On user confirmation, re-submit with `{ confirmedOverride: true }` in the request body

## Environment

```
EXPO_PUBLIC_API_URL=http://<local-ip>:3000/api   # .env (device must reach this IP)
```

Fallback in `lib/api.ts`: `http://10.0.2.2:3001/api` (Android emulator localhost).

## Shared Types

Types from the monorepo `packages/types` are imported as `@trading-app/types` (e.g., `InventoryEntry`, `ConsignmentRequest`, `ConsignmentStatus`). Do **not** redefine these locally.
