import { applyStockDraw } from '../lib/offline-stock';
import { computeOfflineAllowance } from '../lib/mini-allowance';
import type { CachedProduct, PendingSale } from '../store/offline.store';

/**
 * Offline selling of sized (carton-with-variants) products: the offline shelf
 * must count down per size the same way the server will, and a mini's offline
 * allowance must value each size at its own agreed price.
 */

const casserole = (): CachedProduct => ({
  productName: 'casserole',
  unitCost: '1.0000',
  availableQty: 20,
  kind: 'group',
  groupId: 'g1',
  cartonSellingPrice: '30.0000',
  cartonsAvailable: 4,
  usdToFcRateSnapshot: '2800',
  variants: [
    // 1 carton = 2 small + 3 large
    { variantId: 'small', label: 'small', unitCost: '1.0000', sellingPrice: '2.0000', piecesPerCarton: 2, available: 8 },
    { variantId: 'large', label: 'large', unitCost: '3.0000', sellingPrice: '6.0000', piecesPerCarton: 3, available: 12 },
  ],
});

const simple = (): CachedProduct => ({ productName: 'rice', unitCost: '1.0000', availableQty: 10 });

describe('applyStockDraw', () => {
  it('a size sale takes pieces off that size only and re-derives totals', () => {
    const [p] = applyStockDraw([casserole()], { productName: 'casserole', qty: 7, variantId: 'large' }, -1);
    expect(p.variants!.find((v) => v.variantId === 'large')!.available).toBe(5);
    expect(p.variants!.find((v) => v.variantId === 'small')!.available).toBe(8);
    expect(p.availableQty).toBe(13);
    expect(p.cartonsAvailable).toBe(1); // large: floor(5/3) = 1 limits it
  });

  it('a carton sale takes each size by its per-carton count', () => {
    const [p] = applyStockDraw([casserole()], { productName: 'casserole', qty: 10, cartonQty: 2 }, -1);
    expect(p.variants!.map((v) => v.available)).toEqual([4, 6]);
    expect(p.availableQty).toBe(10);
    expect(p.cartonsAvailable).toBe(2);
  });

  it('putting a carton sale back restores exactly what it took', () => {
    const sold = applyStockDraw([casserole()], { productName: 'casserole', qty: 10, cartonQty: 2 }, -1);
    const [p] = applyStockDraw(sold, { productName: 'casserole', qty: 10, cartonQty: 2 }, 1);
    expect(p).toEqual(casserole());
  });

  it('never goes negative and leaves simple products on the old path', () => {
    const [c, r] = applyStockDraw(
      [casserole(), simple()],
      { productName: 'rice', qty: 99 },
      -1,
    );
    expect(c).toEqual(casserole());
    expect(r.availableQty).toBe(0);
  });
});

describe('computeOfflineAllowance — sized sales', () => {
  const sale = (extra: Partial<PendingSale>): PendingSale => ({
    id: 'x',
    productName: 'casserole',
    qtySold: 1,
    salePrice: '0',
    recordedAt: new Date().toISOString(),
    syncError: null,
    ...extra,
  });

  const soldFcFor = (pendingSales: PendingSale[]): number =>
    parseFloat(
      computeOfflineAllowance({
        snapshot: { pct: '10', soldFc: '0', spentFc: '0' },
        cachedProducts: [casserole()],
        pendingSales,
        pendingExpenses: [],
        snapshotRate: '2800',
      })!.soldFc,
    );

  it('values a size sale at that size’s agreed price', () => {
    // 2 large × 3 USD × 2800
    expect(soldFcFor([sale({ qtySold: 2, variantId: 'large' })])).toBeCloseTo(16800);
  });

  it('values a carton sale across every size', () => {
    // one carton = 2 × 1 + 3 × 3 = 11 USD → × 2800
    expect(
      soldFcFor([
        sale({ qtySold: 5, carton: { groupId: 'g1', cartonQty: 1, cartonPrice: '30.0000' } }),
      ]),
    ).toBeCloseTo(30800);
  });
});
