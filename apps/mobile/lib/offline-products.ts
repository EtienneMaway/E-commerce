import type { ProductSummary } from './api';
import type { CachedProduct } from '../store/offline.store';

/**
 * Snapshot one product for offline mode. Keeps the sized-product fields (sizes,
 * per-size stock and price, carton price) so offline selling offers the same
 * carton / by-size choices as online and the queued sale names its size.
 */
export function toCachedProduct(p: ProductSummary): CachedProduct {
  return {
    productName: p.productName,
    unitCost: p.latestUnitCost,
    availableQty: p.totalAvailable,
    piecesPerCarton: p.piecesPerCarton,
    latestSellingPrice: p.latestSellingPrice,
    latestCartonPrice: p.latestCartonPrice,
    category: p.category,
    usdToFcRateSnapshot: p.usdToFcRateSnapshot,
    ...(p.kind === 'group'
      ? {
          kind: 'group' as const,
          groupId: p.groupId,
          cartonSellingPrice: p.cartonSellingPrice ?? null,
          cartonsAvailable: p.cartonsAvailable ?? 0,
          variants: (p.variants ?? []).map((v) => ({
            variantId: v.variantId,
            label: v.label,
            unitCost: v.unitCost,
            sellingPrice: v.sellingPrice,
            piecesPerCarton: v.piecesPerCarton,
            available: v.available,
            usdToFcRateSnapshot: v.usdToFcRateSnapshot ?? null,
          })),
        }
      : {}),
  };
}

/** Rebuild the screen-facing summary from the offline cache (stock already counted down). */
export function fromCachedProduct(p: CachedProduct): ProductSummary {
  return {
    productName: p.productName,
    category: p.category ?? null,
    piecesPerCarton: p.piecesPerCarton ?? null,
    latestCartonPrice: p.latestCartonPrice ?? null,
    totalAvailable: p.availableQty,
    sourceBreakdown: { personal: 0, supplier: 0, consignedIn: 0, consignedOut: 0 },
    latestSellingPrice: p.latestSellingPrice ?? p.unitCost,
    latestUnitCost: p.unitCost,
    usdToFcRateSnapshot: p.usdToFcRateSnapshot ?? null,
    // A snapshot from an older build has no sizes — it stays "simple", as before.
    ...(p.kind === 'group' && p.groupId && p.variants
      ? {
          kind: 'group' as const,
          groupId: p.groupId,
          cartonSellingPrice: p.cartonSellingPrice ?? null,
          cartonsAvailable: p.cartonsAvailable ?? 0,
          variants: p.variants.map((v) => ({ ...v })),
        }
      : {}),
  };
}
