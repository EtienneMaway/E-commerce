import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { SalesService, allocateCartonUnitPrices } from './sales.service';
import { InventoryEntry, InventorySource, SaleTransaction } from '../entities';
import type { ActorContext } from '../common/types/actor-context';

const OWNER = 'owner-1';

const ownerCtx: ActorContext = {
  actorId: OWNER,
  effectiveOwnerId: OWNER,
  tier: 'OWNER',
  employment: null,
} as unknown as ActorContext;

describe('allocateCartonUnitPrices', () => {
  it('splits pro-rata by standalone value and sums back to the carton price', () => {
    // carton price 144; sizes: small 3×20, large 6×20 → standalone 180
    const gating = [
      { sellingPrice: '3.0000', piecesPerCarton: 20 },
      { sellingPrice: '6.0000', piecesPerCarton: 20 },
    ];
    const [small, large] = allocateCartonUnitPrices(new Decimal('144'), gating);
    expect(small.toFixed(4)).toBe('2.4000');
    expect(large.toFixed(4)).toBe('4.8000');
    // per-piece × pieces sums to the carton price
    const sum = small.mul(20).plus(large.mul(20));
    expect(sum.toFixed(4)).toBe('144.0000');
    // preserves the 1:2 ratio between small and large
    expect(large.div(small).toFixed(4)).toBe('2.0000');
  });

  it('throws when sizes have no standalone value to allocate against', () => {
    expect(() =>
      allocateCartonUnitPrices(new Decimal('100'), [
        { sellingPrice: '0.0000', piecesPerCarton: 20 },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('SalesService.recordSale — whole-carton sale', () => {
  interface Lot extends Partial<InventoryEntry> {
    id: string;
    variantId: string;
    source: InventorySource;
    unitCost: string;
    quantityRemaining: number;
  }

  function build(opts: {
    cartonSellingPrice: string | null;
    lots: Record<string, Partial<Record<InventorySource, Lot[]>>>;
    variants?: {
      id: string;
      label: string;
      sellingPrice: string;
      piecesPerCarton: number;
      sortOrder: number;
      archived?: boolean;
    }[];
  }) {
    const variants = opts.variants ?? [
      { id: 'v-s', label: 'small', sellingPrice: '3.0000', piecesPerCarton: 20, sortOrder: 0 },
      { id: 'v-l', label: 'large', sellingPrice: '6.0000', piecesPerCarton: 20, sortOrder: 1 },
    ];
    const group = {
      id: 'g1',
      ownerId: OWNER,
      name: 'casserole',
      cartonSellingPrice: opts.cartonSellingPrice,
      variants: variants.map((v) => ({ ...v, archived: v.archived ?? false })),
    };

    const savedSales: SaleTransaction[] = [];
    const manager = {
      save: jest.fn(async (Entity: unknown, obj: Record<string, unknown>) => {
        if (Entity === SaleTransaction) {
          if (!obj.id) obj.id = `sale-${savedSales.length + 1}`;
          savedSales.push(obj as unknown as SaleTransaction);
        }
        return obj;
      }),
      create: jest.fn((_Entity: unknown, obj: Record<string, unknown>) => ({ ...obj })),
    };

    const entryRepo = {
      find: jest.fn(async (o: { where: { variantId: string; source: InventorySource } }) => {
        const { variantId, source } = o.where;
        return opts.lots[variantId]?.[source] ?? [];
      }),
    };
    const groupRepo = { findOne: jest.fn(async () => group) };
    const variantRepo = { findOne: jest.fn(async () => null) };
    const saleRepo = { findOne: jest.fn(async () => null) };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    };
    const stockMovements = { record: jest.fn(async () => ({})) };
    const pricingService = {
      applyEmployeePriceRule: jest.fn(async (args: { submittedUnitPrice: string }) => ({
        effectiveUnitPrice: new Decimal(args.submittedUnitPrice).toFixed(4),
        standardPrice: group.cartonSellingPrice,
        capped: false,
        originalUnitPrice: null,
      })),
    };

    const service = new SalesService(
      saleRepo as never,
      entryRepo as never,
      groupRepo as never,
      variantRepo as never,
      dataSource as never,
      stockMovements as never,
      pricingService as never,
    );
    return { service, savedSales, group };
  }

  it('deducts the composition across sizes, allocates price, shares a cartonSaleId', async () => {
    const small: Lot = { id: 'e-s', variantId: 'v-s', source: InventorySource.PERSONAL, unitCost: '2.0000', quantityRemaining: 30 };
    const large: Lot = { id: 'e-l', variantId: 'v-l', source: InventorySource.PERSONAL, unitCost: '4.0000', quantityRemaining: 25 };
    const { service, savedSales } = build({
      cartonSellingPrice: '144.0000',
      lots: { 'v-s': { PERSONAL: [small] }, 'v-l': { PERSONAL: [large] } },
    });

    const result = await service.recordSale(ownerCtx, {
      productName: 'casserole',
      carton: true,
      groupId: 'g1',
      cartonQty: 1,
      salePrice: '144.0000',
    } as never);

    // one row per size
    expect(savedSales).toHaveLength(2);
    const bySize = Object.fromEntries(savedSales.map((s) => [s.variantLabel, s]));
    expect(bySize.small.salePrice).toBe('2.4000');
    expect(bySize.large.salePrice).toBe('4.8000');
    expect(bySize.small.qtySold).toBe(20);
    expect(bySize.large.qtySold).toBe(20);
    expect(bySize.small.profit).toBe('8.0000'); // (2.4-2)×20
    expect(bySize.large.profit).toBe('16.0000'); // (4.8-4)×20
    // all rows share one cartonSaleId
    expect(savedSales[0].cartonSaleId).toBeTruthy();
    expect(new Set(savedSales.map((s) => s.cartonSaleId)).size).toBe(1);
    // stock drained
    expect(small.quantityRemaining).toBe(10);
    expect(large.quantityRemaining).toBe(5);
    // total revenue == carton price
    const revenue = savedSales.reduce(
      (acc, s) => acc.plus(new Decimal(s.salePrice).mul(s.qtySold)),
      new Decimal(0),
    );
    expect(revenue.toFixed(4)).toBe('144.0000');
    expect(result.cartonSaleId).toBeTruthy();
  });

  it('walks lots FIFO within a size when one lot cannot cover the composition', async () => {
    const smallA: Lot = { id: 'e-sa', variantId: 'v-s', source: InventorySource.PERSONAL, unitCost: '2.0000', quantityRemaining: 12 };
    const smallB: Lot = { id: 'e-sb', variantId: 'v-s', source: InventorySource.PERSONAL, unitCost: '2.0000', quantityRemaining: 30 };
    const large: Lot = { id: 'e-l', variantId: 'v-l', source: InventorySource.PERSONAL, unitCost: '4.0000', quantityRemaining: 40 };
    const { service, savedSales } = build({
      cartonSellingPrice: '144.0000',
      lots: { 'v-s': { PERSONAL: [smallA, smallB] }, 'v-l': { PERSONAL: [large] } },
    });

    await service.recordSale(ownerCtx, {
      productName: 'casserole',
      carton: true,
      groupId: 'g1',
      cartonQty: 1,
      salePrice: '144.0000',
    } as never);

    // small split 12 + 8 across two lots → 3 rows total
    expect(savedSales).toHaveLength(3);
    const smallRows = savedSales.filter((s) => s.variantLabel === 'small');
    expect(smallRows.map((s) => s.qtySold).sort((a, b) => a - b)).toEqual([8, 12]);
    expect(smallA.quantityRemaining).toBe(0);
    expect(smallB.quantityRemaining).toBe(22);
  });

  it('fires the carton-level price guard when the carton is at/under total cost', async () => {
    const small: Lot = { id: 'e-s', variantId: 'v-s', source: InventorySource.PERSONAL, unitCost: '2.0000', quantityRemaining: 30 };
    const large: Lot = { id: 'e-l', variantId: 'v-l', source: InventorySource.PERSONAL, unitCost: '4.0000', quantityRemaining: 25 };
    const { service } = build({
      cartonSellingPrice: '100.0000', // total cost = 20×2 + 20×4 = 120 → loss
      lots: { 'v-s': { PERSONAL: [small] }, 'v-l': { PERSONAL: [large] } },
    });

    await expect(
      service.recordSale(ownerCtx, {
        productName: 'casserole',
        carton: true,
        groupId: 'g1',
        cartonQty: 1,
        salePrice: '100.0000',
      } as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    // untouched stock (guard threw before the transaction)
    expect(small.quantityRemaining).toBe(30);
  });

  it('proceeds past the guard with confirmedOverride', async () => {
    const small: Lot = { id: 'e-s', variantId: 'v-s', source: InventorySource.PERSONAL, unitCost: '2.0000', quantityRemaining: 30 };
    const large: Lot = { id: 'e-l', variantId: 'v-l', source: InventorySource.PERSONAL, unitCost: '4.0000', quantityRemaining: 25 };
    const { service, savedSales } = build({
      cartonSellingPrice: '100.0000',
      lots: { 'v-s': { PERSONAL: [small] }, 'v-l': { PERSONAL: [large] } },
    });

    await service.recordSale(ownerCtx, {
      productName: 'casserole',
      carton: true,
      groupId: 'g1',
      cartonQty: 1,
      salePrice: '100.0000',
      confirmedOverride: true,
    } as never);
    expect(savedSales).toHaveLength(2);
  });

  it('rejects when a size cannot cover the carton composition', async () => {
    const small: Lot = { id: 'e-s', variantId: 'v-s', source: InventorySource.PERSONAL, unitCost: '2.0000', quantityRemaining: 30 };
    const large: Lot = { id: 'e-l', variantId: 'v-l', source: InventorySource.PERSONAL, unitCost: '4.0000', quantityRemaining: 10 };
    const { service } = build({
      cartonSellingPrice: '144.0000',
      lots: { 'v-s': { PERSONAL: [small] }, 'v-l': { PERSONAL: [large] } },
    });

    await expect(
      service.recordSale(ownerCtx, {
        productName: 'casserole',
        carton: true,
        groupId: 'g1',
        cartonQty: 1,
        salePrice: '144.0000',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a carton sale when carton selling is disabled', async () => {
    const { service } = build({ cartonSellingPrice: null, lots: {} });
    await expect(
      service.recordSale(ownerCtx, {
        productName: 'casserole',
        carton: true,
        groupId: 'g1',
        salePrice: '144.0000',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
