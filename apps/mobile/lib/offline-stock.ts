import type { CachedProduct, CachedVariant } from '../store/offline.store';

/** What a queued sale took off the shelf — a whole product, one size, or whole cartons. */
export interface StockDraw {
  productName: string;
  qty: number;
  variantId?: string;
  cartonQty?: number;
}

/**
 * Apply a stock change (`sign` −1 = sold, +1 = put back) to the offline shelf.
 * A size draw moves that size; a carton draw moves every carton size by its
 * per-carton count; either way the product total and the whole-carton count are
 * re-derived from the sizes, the same way `GET /inventory/products` does.
 */
export function applyStockDraw(
  products: CachedProduct[],
  draw: StockDraw,
  sign: 1 | -1,
): CachedProduct[] {
  return products.map((p) => {
    if (p.productName !== draw.productName) return p;
    if (!p.variants || p.variants.length === 0 || (!draw.variantId && !draw.cartonQty)) {
      return { ...p, availableQty: Math.max(0, p.availableQty + sign * draw.qty) };
    }
    const variants = p.variants.map((v) => {
      const delta = draw.cartonQty
        ? v.piecesPerCarton * draw.cartonQty
        : v.variantId === draw.variantId
          ? draw.qty
          : 0;
      return delta === 0 ? v : { ...v, available: Math.max(0, v.available + sign * delta) };
    });
    return withVariantStock(p, variants);
  });
}

/** Re-derive a sized product's totals from its sizes. */
export function withVariantStock(p: CachedProduct, variants: CachedVariant[]): CachedProduct {
  const gating = variants.filter((v) => v.piecesPerCarton > 0);
  return {
    ...p,
    variants,
    availableQty: variants.reduce((s, v) => s + v.available, 0),
    cartonsAvailable:
      gating.length === 0
        ? 0
        : Math.min(...gating.map((v) => Math.floor(v.available / v.piecesPerCarton))),
  };
}
