'use client';

import { create } from 'zustand';
import { setOrgId, setShopId } from '../lib/api';

/** `'all'` is a cross-branch READ; the API refuses every write under it. */
export const ALL_SHOPS = 'all';

export interface ShopSummary {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isArchived: boolean;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  taxId: string | null;
  logoUrl: string | null;
  isOwner: boolean;
}

const SHOP_KEY = 'ta_shop';
const ORG_KEY = 'ta_org';

interface ShopState {
  /** Selected branch id, `'all'`, or null for "whatever the API defaults to". */
  shopId: string | null;
  /** Selected business, only meaningful for an owner who administers several. */
  orgId: string | null;
  shops: ShopSummary[];
  organizations: OrganizationSummary[];
  organization: OrganizationSummary | null;

  setShop: (shopId: string | null) => void;
  setOrg: (orgId: string | null) => void;
  /** Called after /auth/me with what the API says this account can see. */
  setContext: (ctx: {
    shops: ShopSummary[];
    organizations: OrganizationSummary[];
    organization: OrganizationSummary | null;
  }) => void;
  hydrate: () => void;
}

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

function write(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

/**
 * Which branch the dashboard is looking at.
 *
 * A near-copy of `persona.store.ts`, deliberately: both mirror their value into
 * `lib/api.ts` so the axios interceptor can read it synchronously without
 * importing the store back.
 *
 * Switching does NOT merge caches — `app-providers.tsx` clears the whole React
 * Query cache on a change. Threading `shopId` through ~40 query keys would be 40
 * chances to miss one, and a missed one shows branch A's data under branch B's
 * name, which reads as a data-integrity bug rather than a caching one.
 */
export const useShopStore = create<ShopState>((set) => ({
  shopId: null,
  orgId: null,
  shops: [],
  organizations: [],
  organization: null,

  setShop: (shopId) => {
    write(SHOP_KEY, shopId);
    setShopId(shopId);
    set({ shopId });
  },

  setOrg: (orgId) => {
    write(ORG_KEY, orgId);
    setOrgId(orgId);
    // A branch belongs to one business, so changing business invalidates the
    // branch selection rather than carrying a now-foreign id into a 404.
    write(SHOP_KEY, null);
    setShopId(null);
    set({ orgId, shopId: null });
  },

  setContext: ({ shops, organizations, organization }) => {
    set({ shops, organizations, organization });

    // Drop a stored selection that no longer exists — a branch closed, or a
    // business handed over. Silently falling back to the default beats 404ing
    // on every request until someone clears their browser storage.
    const stored = read(SHOP_KEY);
    if (stored && stored !== ALL_SHOPS && !shops.some((s) => s.id === stored)) {
      write(SHOP_KEY, null);
      setShopId(null);
      set({ shopId: null });
    }
    const storedOrg = read(ORG_KEY);
    if (storedOrg && !organizations.some((o) => o.id === storedOrg)) {
      write(ORG_KEY, null);
      setOrgId(null);
      set({ orgId: null });
    }
  },

  hydrate: () => {
    const shopId = read(SHOP_KEY);
    const orgId = read(ORG_KEY);
    setShopId(shopId);
    setOrgId(orgId);
    set({ shopId, orgId });
  },
}));

/** True when the current selection is a cross-branch read, where writes are refused. */
export function isAllShops(shopId: string | null): boolean {
  return shopId === ALL_SHOPS;
}
