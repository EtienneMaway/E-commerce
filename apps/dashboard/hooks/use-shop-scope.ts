'use client';

import { ALL_SHOPS, useShopStore } from '../store/shop.store';

/**
 * Whether this view can write.
 *
 * Under "All branches" the API refuses every non-GET with a 400 — "add this
 * product to all my shops" is a different feature, not this one. Pages disable
 * their write controls rather than letting someone fill in a form and discover
 * the refusal on submit.
 */
export function useShopScope(): {
  shopId: string | null;
  isAllShops: boolean;
  /** True when a write is possible: one branch selected, and it is open. */
  canWrite: boolean;
  /** The branch's name, for labelling rows under a cross-branch view. */
  shopName: (id: string | null | undefined) => string;
} {
  const { shopId, shops } = useShopStore();
  const isAll = shopId === ALL_SHOPS;
  const selected = shops.find((s) => s.id === shopId) ?? shops.find((s) => s.isDefault);

  return {
    shopId,
    isAllShops: isAll,
    canWrite: !isAll && !selected?.isArchived,
    shopName: (id) => shops.find((s) => s.id === id)?.name ?? '',
  };
}
