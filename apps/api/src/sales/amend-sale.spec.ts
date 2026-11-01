import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import {
  InventoryEntry,
  InventorySource,
  MiniSettlementStatus,
  ProductGroup,
  ProductVariant,
  SaleTransaction,
  StockMovementReason,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { testCtx } from '../common/testing/actor-context.fixture';

const OWNER = 'owner-1';
const MINI = 'mini-3';

const ownerCtx: ActorContext = testCtx({
  actorId: OWNER,
  effectiveOwnerId: OWNER,
  tier: 'OWNER',
  employment: null,
});

const miniCtx: ActorContext = testCtx({
  actorId: MINI,
  effectiveOwnerId: MINI,
  tier: 'MINI_EMPLOYEE',
  employment: { employerId: OWNER } as ActorContext['employment'],
});

/**
 * Wires a SalesService around one live sale on one lot, with a manager whose
 * reads and writes act on that single mutable lot — so the void's restore and
 * the re-record's deduction compose exactly as they would in one real
 * transaction. `settlements` answers a mini's handover lookups in order.
 */
function build(opts: {
  sale?: Partial<SaleTransaction>;
  entry?: Partial<InventoryEntry>;
  settlements?: (null | { status: MiniSettlementStatus; approvedAt?: Date | null })[];
}) {
  const today = new Date();
  const sale = {
    id: 'sale-1',
    ownerId: OWNER,
    orgId: 'org-1',
    shopId: 'shop-1',
    actorId: null,
    productName: 'rice',
    source: InventorySource.PERSONAL,
    qtySold: 4,
    unitCost: '2.0000',
    salePrice: '3.0000',
    profit: '4.0000',
    inventoryEntryId: 'entry-1',
    cartonSaleId: null,
    rejectedAt: null,
    amendedAt: null,
    amendedToId: null,
    date: today,
    ...opts.sale,
  } as unknown as SaleTransaction;

  const entry = {
    id: 'entry-1',
    ownerId: sale.ownerId,
    orgId: 'org-1',
    shopId: 'shop-1',
    productName: 'rice',
    source: InventorySource.PERSONAL,
    unitCost: '2.0000',
    usdToFcRateSnapshot: null,
    quantityRemaining: 6,
    ...opts.entry,
  } as unknown as InventoryEntry;

  let created = 0;
  const createdSales: SaleTransaction[] = [];
  const manager = {
    findOne: jest.fn(async (Entity: unknown) => {
      if (Entity === SaleTransaction) return sale;
      if (Entity === InventoryEntry) return entry;
      return null;
    }),
    find: jest.fn(
      async (Entity: unknown, o: { where: { source: InventorySource } }) =>
        Entity === InventoryEntry &&
        entry.quantityRemaining > 0 &&
        entry.source === o.where.source
          ? [entry]
          : [],
    ),
    save: jest.fn(async (Entity: unknown, obj: Record<string, unknown>) => {
      if (Entity === SaleTransaction && !obj.id) {
        obj.id = `new-${++created}`;
        createdSales.push(obj as unknown as SaleTransaction);
      }
      return obj;
    }),
    create: jest.fn((_E: unknown, obj: Record<string, unknown>) => ({ ...obj })),
    update: jest.fn(async () => ({})),
  };

  const settlementQueue = [...(opts.settlements ?? [])];
  const settlementRepo = {
    findOne: jest.fn(async () => settlementQueue.shift() ?? null),
  };
  const saleRepo = {
    findOne: jest.fn(async () => sale),
    find: jest.fn(async () => [sale]),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  const stockMovements = { record: jest.fn(async () => ({})) };
  const pricingService = {
    applyEmployeePriceRule: jest.fn(async (args: { submittedUnitPrice: string }) => ({
      effectiveUnitPrice: args.submittedUnitPrice,
      standardPrice: null,
      capped: false,
      originalUnitPrice: null,
    })),
  };
  const custody = {
    allowedCustodianIds: jest.fn(async () => new Set<string>()),
    saleStamp: jest.fn(async () => ({ custodyId: null, approvalStatus: 'AUTO' })),
  };

  const service = new SalesService(
    saleRepo as never,
    { find: jest.fn(async () => []) } as never,
    {} as never,
    {} as never,
    settlementRepo as never,
    dataSource as never,
    stockMovements as never,
    pricingService as never,
    custody as never,
  );
  return { service, sale, entry, stockMovements, manager, createdSales };
}

describe('SalesService.amendSale', () => {
  it('corrects the quantity: restores the old qty then deducts the new, atomically', async () => {
    const { service, sale, entry, stockMovements, manager, createdSales } = build({});
    // lot starts at 6; original sold 4.
    const result = await service.amendSale(ownerCtx, 'sale-1', {
      productName: 'rice',
      qtySold: 1,
      salePrice: '3.0000',
    });

    // 6 + 4 restored − 1 re-deducted = 9
    expect(entry.quantityRemaining).toBe(9);
    // original voided + flagged as an amendment, linked to the new row
    expect(sale.rejectedAt).toBeInstanceOf(Date);
    expect(sale.amendedAt).toBeInstanceOf(Date);
    expect(manager.update).toHaveBeenCalledWith(
      SaleTransaction,
      { id: 'sale-1' },
      { amendedToId: result.id },
    );
    // corrected row
    expect(result.qtySold).toBe(1);
    expect(result.amendedFromId).toBe('sale-1');
    expect(createdSales).toHaveLength(1);
    // one restore movement + one new-sale movement
    const reasons = stockMovements.record.mock.calls.map(
      (c) => (c as unknown as [unknown, { reason: StockMovementReason }])[1].reason,
    );
    expect(reasons).toEqual([
      StockMovementReason.SALE_REJECTED,
      StockMovementReason.SALE,
    ]);
  });

  it('corrects the price', async () => {
    const { service, entry } = build({});
    const out = await service.amendSale(ownerCtx, 'sale-1', {
      productName: 'rice',
      qtySold: 4,
      salePrice: '5.0000',
    });
    expect(out.salePrice).toBe('5.0000');
    // qty unchanged: 6 + 4 − 4 = 6
    expect(entry.quantityRemaining).toBe(6);
  });

  it('refuses a sale not recorded on my books', async () => {
    const { service } = build({
      sale: { ownerId: 'someone-else', orgId: 'org-x', shopId: 'shop-x' },
    });
    await expect(
      service.amendSale(ownerCtx, 'sale-1', { productName: 'rice', qtySold: 1, salePrice: '3' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses when the actor did not record the sale', async () => {
    const { service } = build({ sale: { actorId: 'another-employee' } });
    const otherEmp = testCtx({
      actorId: 'me-employee',
      effectiveOwnerId: OWNER,
      tier: 'FULL_EMPLOYEE',
    });
    await expect(
      service.amendSale(otherEmp, 'sale-1', { productName: 'rice', qtySold: 1, salePrice: '3' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a sale from a previous day', async () => {
    const { service } = build({
      sale: { date: new Date('2020-01-01T10:00:00Z') },
    });
    await expect(
      service.amendSale(ownerCtx, 'sale-1', { productName: 'rice', qtySold: 1, salePrice: '3' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an already-voided sale', async () => {
    const { service } = build({ sale: { rejectedAt: new Date() } });
    await expect(
      service.amendSale(ownerCtx, 'sale-1', { productName: 'rice', qtySold: 1, salePrice: '3' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('surfaces the price-guard 422 when the corrected price is below cost', async () => {
    const { service } = build({}); // cost 2.0000
    await expect(
      service.amendSale(ownerCtx, 'sale-1', {
        productName: 'rice',
        qtySold: 1,
        salePrice: '1.0000', // below cost, no override
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('proceeds below cost when confirmedOverride is sent', async () => {
    const { service, entry } = build({});
    const out = await service.amendSale(ownerCtx, 'sale-1', {
      productName: 'rice',
      qtySold: 1,
      salePrice: '1.0000',
      confirmedOverride: true,
    });
    expect(out.salePrice).toBe('1.0000');
    expect(entry.quantityRemaining).toBe(9);
  });

  it('blocks a mini whose handover is awaiting approval', async () => {
    const { service } = build({
      sale: { ownerId: MINI, actorId: null },
      entry: { ownerId: MINI },
      settlements: [{ status: MiniSettlementStatus.PENDING }],
    });
    await expect(
      service.amendSale(miniCtx, 'sale-1', { productName: 'rice', qtySold: 1, salePrice: '3' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a mini amend a sale in the still-open cycle', async () => {
    const { service, entry } = build({
      sale: { ownerId: MINI, actorId: null },
      entry: { ownerId: MINI },
      settlements: [
        null, // no pending handover
        { status: MiniSettlementStatus.APPROVED, approvedAt: new Date('2020-01-01') },
      ],
    });
    const out = await service.amendSale(miniCtx, 'sale-1', {
      productName: 'rice',
      qtySold: 2,
      salePrice: '3.0000',
    });
    expect(out.qtySold).toBe(2);
    expect(entry.quantityRemaining).toBe(8); // 6 + 4 − 2
  });
});
