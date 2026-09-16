import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { setShopId } from '../lib/api';

const SHOP_KEY = 'ta_shop';

export interface ShopSummary {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly isDefault: boolean;
  readonly isArchived: boolean;
}

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly logoUrl: string | null;
  readonly isOwner: boolean;
}

interface ShopContext {
  shops: ShopSummary[];
  organization: OrganizationSummary | null;
  defaultShopId: string | null;
  /** True when the user works for someone — they never pick a branch. */
  employed: boolean;
}

interface ShopState extends ShopContext {
  /** The owner's chosen branch, or null for "the business's default". */
  selectedId: string | null;
  hydrate: () => Promise<void>;
  setShop: (shopId: string) => Promise<void>;
  /** Called with what `/auth/me` says this account can see. */
  setContext: (ctx: ShopContext) => Promise<void>;
  resetForLogout: () => Promise<void>;
  /**
   * The concrete branch a write made right now lands in, for stamping onto an
   * offline queue row. Null for an employee: the API resolves their branch from
   * the employment, which does not move between enqueue and replay.
   */
  captureShopId: () => string | null;
}

/**
 * The header value: only an owner who chose a branch sends one. Everyone else
 * sends nothing and the API resolves the default (an owner) or the employment's
 * branch (an employee) — which is also what keeps an employee on Self mode
 * reading their own books rather than carrying the employer's shop id there.
 */
function headerValue(s: { employed: boolean; selectedId: string | null }): string | null {
  return s.employed ? null : s.selectedId;
}

/**
 * Which branch the app is working in. Mirrors the dashboard's store, with one
 * deliberate difference: there is no "All branches" on mobile. Every screen here
 * records stock, sales or expenses, and the API refuses writes across branches.
 *
 * Like `persona.store`, the value is mirrored into `lib/api.ts` so the axios
 * interceptor reads it synchronously without importing the store.
 */
export const useShopStore = create<ShopState>((set, get) => ({
  selectedId: null,
  shops: [],
  organization: null,
  defaultShopId: null,
  employed: false,

  hydrate: async () => {
    const selectedId = await SecureStore.getItemAsync(SHOP_KEY);
    set({ selectedId });
    setShopId(headerValue(get()));
  },

  setShop: async (shopId) => {
    await SecureStore.setItemAsync(SHOP_KEY, shopId);
    set({ selectedId: shopId });
    setShopId(headerValue(get()));
  },

  setContext: async ({ shops, organization, defaultShopId, employed }) => {
    set({ shops, organization, defaultShopId, employed });
    // Drop a selection that no longer exists — a branch closed or the business
    // handed over. Falling back to the default beats 404ing every request.
    const { selectedId } = get();
    if (selectedId && !shops.some((s) => s.id === selectedId && !s.isArchived)) {
      await SecureStore.deleteItemAsync(SHOP_KEY);
      set({ selectedId: null });
    }
    setShopId(headerValue(get()));
  },

  resetForLogout: async () => {
    await SecureStore.deleteItemAsync(SHOP_KEY);
    set({ selectedId: null, shops: [], organization: null, defaultShopId: null, employed: false });
    setShopId(null);
  },

  captureShopId: () => {
    const s = get();
    if (s.employed) return null;
    return s.selectedId ?? s.defaultShopId;
  },
}));

/** The branch currently in use, for labels. Null before `/auth/me` has answered. */
export function useCurrentShop(): ShopSummary | null {
  return useShopStore((s) => {
    const id = s.employed ? s.defaultShopId : (s.selectedId ?? s.defaultShopId);
    return s.shops.find((shop) => shop.id === id) ?? null;
  });
}
