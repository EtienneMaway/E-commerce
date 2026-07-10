/**
 * Quantity ("group of prices") discount resolution — mirrors the server's
 * `apps/api/src/quantity-discounts/quantity-discount.util.ts` so the client and
 * API agree on the applied percentage. Keep the two in sync.
 */
import type { QuantityDiscountConfig } from './api';

export const HALF_DOZEN_THRESHOLD = 6;
export const DOZEN_THRESHOLD = 12;

export type QuantityTier = 'half_dozen' | 'dozen' | 'carton';

/**
 * The HIGHEST percentage among every tier whose threshold `qty` meets. Robust
 * to any ordering of the configured percentages; returns 0 when none applies or
 * the config is disabled/absent.
 */
export function resolveQuantityDiscountPercent(
  qty: number,
  piecesPerCarton: number | null | undefined,
  cfg: QuantityDiscountConfig | null | undefined,
): number {
  if (!cfg || !cfg.enabled) return 0;
  const candidates: number[] = [];
  if (qty >= HALF_DOZEN_THRESHOLD) candidates.push(Number(cfg.halfDozenPercent) || 0);
  if (qty >= DOZEN_THRESHOLD) candidates.push(Number(cfg.dozenPercent) || 0);
  if (piecesPerCarton && piecesPerCarton > 0 && qty >= piecesPerCarton) {
    candidates.push(Number(cfg.cartonPercent) || 0);
  }
  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
}

/** Which tier produced the winning percentage (largest threshold on ties). */
export function quantityTierFor(
  qty: number,
  piecesPerCarton: number | null | undefined,
  cfg: QuantityDiscountConfig | null | undefined,
): QuantityTier | null {
  const pct = resolveQuantityDiscountPercent(qty, piecesPerCarton, cfg);
  if (pct <= 0 || !cfg) return null;
  const met: { tier: QuantityTier; pct: number }[] = [];
  if (qty >= HALF_DOZEN_THRESHOLD) met.push({ tier: 'half_dozen', pct: Number(cfg.halfDozenPercent) || 0 });
  if (qty >= DOZEN_THRESHOLD) met.push({ tier: 'dozen', pct: Number(cfg.dozenPercent) || 0 });
  if (piecesPerCarton && piecesPerCarton > 0 && qty >= piecesPerCarton) {
    met.push({ tier: 'carton', pct: Number(cfg.cartonPercent) || 0 });
  }
  const order = (tr: QuantityTier) => (tr === 'carton' ? 3 : tr === 'dozen' ? 2 : 1);
  const winner = met.filter((m) => m.pct === pct).sort((a, b) => order(b.tier) - order(a.tier))[0];
  return winner ? winner.tier : null;
}

/** Clamp a user-entered percentage to the valid 0–100 range. */
export function clampPercent(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
