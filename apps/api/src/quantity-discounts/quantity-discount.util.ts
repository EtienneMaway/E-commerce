/**
 * Shared, pure resolution rule for quantity ("group of prices") discounts.
 * Mirrored on the mobile client so both agree on the applied percentage.
 */

/** Minimum quantity for the half-dozen tier. */
export const HALF_DOZEN_THRESHOLD = 6;
/** Minimum quantity for the dozen tier. */
export const DOZEN_THRESHOLD = 12;

export interface QuantityDiscountTiers {
  halfDozenPercent: string;
  dozenPercent: string;
  cartonPercent: string;
}

/**
 * Resolve the discount percentage for a sale of `qty` pieces: the HIGHEST
 * percentage among every tier whose threshold the quantity meets. Robust to any
 * ordering of the configured percentages, so odd carton sizes (e.g. ppc = 6 or
 * 30) need no special-casing. Returns 0 when no tier applies.
 *
 * @param qty              pieces being sold
 * @param piecesPerCarton  the product's carton size, or null/0 if it has none
 * @param cfg              the shop's configured tier percentages
 */
export function resolveQuantityDiscountPercent(
  qty: number,
  piecesPerCarton: number | null | undefined,
  cfg: QuantityDiscountTiers,
): number {
  const candidates: number[] = [];
  if (qty >= HALF_DOZEN_THRESHOLD) {
    candidates.push(Number(cfg.halfDozenPercent) || 0);
  }
  if (qty >= DOZEN_THRESHOLD) {
    candidates.push(Number(cfg.dozenPercent) || 0);
  }
  if (piecesPerCarton && piecesPerCarton > 0 && qty >= piecesPerCarton) {
    candidates.push(Number(cfg.cartonPercent) || 0);
  }
  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
}

/** Human tier label for the applied percentage (for the discount reason). */
export function quantityTierLabel(
  qty: number,
  piecesPerCarton: number | null | undefined,
  cfg: QuantityDiscountTiers,
): 'half_dozen' | 'dozen' | 'carton' | null {
  const pct = resolveQuantityDiscountPercent(qty, piecesPerCarton, cfg);
  if (pct <= 0) return null;
  // Return the tier that produced the winning percentage, preferring the
  // largest threshold met when percentages tie.
  const met: { tier: 'half_dozen' | 'dozen' | 'carton'; pct: number }[] = [];
  if (qty >= HALF_DOZEN_THRESHOLD) {
    met.push({ tier: 'half_dozen', pct: Number(cfg.halfDozenPercent) || 0 });
  }
  if (qty >= DOZEN_THRESHOLD) {
    met.push({ tier: 'dozen', pct: Number(cfg.dozenPercent) || 0 });
  }
  if (piecesPerCarton && piecesPerCarton > 0 && qty >= piecesPerCarton) {
    met.push({ tier: 'carton', pct: Number(cfg.cartonPercent) || 0 });
  }
  const winner = met
    .filter((m) => m.pct === pct)
    .sort((a, b) => order(b.tier) - order(a.tier))[0];
  return winner ? winner.tier : null;
}

function order(tier: 'half_dozen' | 'dozen' | 'carton'): number {
  return tier === 'carton' ? 3 : tier === 'dozen' ? 2 : 1;
}
