import type {
  AllowanceSnapshot,
  CachedProduct,
  PendingExpense,
  PendingSale,
} from '../store/offline.store';
import type { MiniExpenseAllowance } from './api';

/**
 * The mini's expense ceiling while offline.
 *
 * Mirrors `MiniSettlementsService.expenseAllowance` on the API: a percentage of
 * the AGREED value of what they have sold this handover cycle, minus what they
 * have already claimed. The difference is the inputs — the frozen snapshot taken
 * when going offline, plus the queue that has built up since.
 *
 * Sales made offline count toward the budget straight away, which is the point:
 * a mini who keeps selling keeps earning room to spend, and an expense that
 * would break the ceiling is refused there and then instead of queueing up to be
 * rejected when the queue finally drains.
 *
 * Each sale converts at its own product's locked consignment rate, falling back
 * to the session rate — the same per-batch arithmetic the server does, so the
 * offline figure and the eventual server figure agree.
 */
export function computeOfflineAllowance(input: {
  snapshot: AllowanceSnapshot | null;
  cachedProducts: CachedProduct[];
  pendingSales: PendingSale[];
  pendingExpenses: PendingExpense[];
  /** Session rate frozen at go-offline; used when a product has no locked rate. */
  snapshotRate: string | null;
}): MiniExpenseAllowance | null {
  const { snapshot, cachedProducts, pendingSales, pendingExpenses, snapshotRate } = input;
  if (!snapshot) return null;

  const fallbackRate = parseFloat(snapshotRate ?? '') || 1;
  const byName = new Map(cachedProducts.map((p) => [p.productName, p]));

  // Agreed value of what sold offline. For a mini every cached product is
  // consigned-in stock, whose unitCost IS the price they owe their employer.
  const offlineSoldFc = pendingSales.reduce((sum, sale) => {
    const product = byName.get(sale.productName);
    if (!product) return sum;
    const agreedUsd = parseFloat(product.unitCost) || 0;
    const rate = parseFloat(product.usdToFcRateSnapshot ?? '') || fallbackRate;
    return sum + agreedUsd * sale.qtySold * rate;
  }, 0);

  const offlineSpentFc = pendingExpenses
    .filter((e) => e.kind === 'mini')
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const soldFc = (parseFloat(snapshot.soldFc) || 0) + offlineSoldFc;
  const spentFc = (parseFloat(snapshot.spentFc) || 0) + offlineSpentFc;

  // A snapshot persisted by an older build may carry no percentage; without one
  // there is nothing to enforce, so leave the session uncapped rather than
  // inventing a figure.
  if (snapshot.pct === null) return null;

  const allowanceFc = (soldFc * (parseFloat(snapshot.pct) || 0)) / 100;
  return {
    pct: snapshot.pct,
    soldFc: soldFc.toFixed(4),
    allowanceFc: allowanceFc.toFixed(4),
    spentFc: spentFc.toFixed(4),
    remainingFc: Math.max(0, allowanceFc - spentFc).toFixed(4),
  };
}
