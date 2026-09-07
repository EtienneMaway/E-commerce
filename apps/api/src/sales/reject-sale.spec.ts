import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import {
  InventoryEntry,
  MiniSettlementStatus,
  SaleTransaction,
  StockMovementReason,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';

const OWNER = 'owner-1';
const MINI = 'mini-3';

const ownerCtx: ActorContext = {
  actorId: OWNER,
  effectiveOwnerId: OWNER,
  tier: 'OWNER',
  employment: null,
} as unknown as ActorContext;

const miniCtx: ActorContext = {
  actorId: MINI,
  effectiveOwnerId: MINI,
  tier: 'MINI_EMPLOYEE',
  employment: { employerId: OWNER },
} as unknown as ActorContext;

interface Settlement {
  status: MiniSettlementStatus;
  approvedAt?: Date | null;
}

/**
 * Wires a SalesService around one sale row sitting on one lot. `settlements`
 * answers the mini's handover lookups in the order the service asks for them
 * (PENDING first, then the last APPROVED).
 */
function build(opts: {
  sale?: Partial<SaleTransaction>;
  entry?: Partial<InventoryEntry> | null;
  settlements?: (Settlement | null)[];
}) {
  const sale = {
    id: 'sale-1',
    ownerId: OWNER,
    productName: 'rice',
    qtySold: 4,
    unitCost: '2.0000',
    salePrice: '3.0000',
    profit: '4.0000',
    inventoryEntryId: 'entry-1',
    rejectedAt: null,
    rejectedById: null,
    rejectionReason: null,
    date: new Date('2026-05-02T10:00:00Z'),
    ...opts.sale,
  } as unknown as SaleTransaction;

  const entry =
    opts.entry === null
      ? null
      : ({
          id: 'entry-1',
          ownerId: OWNER,
          productName: 'rice',
          unitCost: '2.0000',
          quantityRemaining: 6,
          ...opts.entry,
        } as unknown as InventoryEntry);

  const manager = {
    findOne: jest.fn(async (Entity: unknown) =>
      Entity === SaleTransaction ? sale : entry,
    ),
    save: jest.fn(async (_Entity: unknown, obj: unknown) => obj),
  };

  const settlementQueue = [...(opts.settlements ?? [])];
  const settlementRepo = {
    findOne: jest.fn(async () => settlementQueue.shift() ?? null),
  };
  const saleRepo = { findOne: jest.fn(async () => sale) };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  const stockMovements = { record: jest.fn(async () => ({})) };

  const service = new SalesService(
    saleRepo as never,
    { find: jest.fn(async () => []) } as never,
    {} as never,
    {} as never,
    settlementRepo as never,
    dataSource as never,
    stockMovements as never,
    {} as never,
  );
  return { service, sale, entry, stockMovements, manager };
}

describe('SalesService.rejectSale', () => {
  it('puts the quantity back on the lot and logs a SALE_REJECTED movement', async () => {
    const { service, sale, entry, stockMovements } = build({});

    const result = await service.rejectSale(ownerCtx, 'sale-1', {
      reason: 'Wrong product',
    });

    expect(entry!.quantityRemaining).toBe(10); // 6 + 4 restored
    expect(result.rejectedAt).toBeInstanceOf(Date);
    expect(result.rejectedById).toBe(OWNER);
    expect(result.rejectionReason).toBe('Wrong product');
    // The row itself survives — rejection is never a delete.
    expect(result.id).toBe(sale.id);
    expect(result.qtySold).toBe(4);

    expect(stockMovements.record).toHaveBeenCalledTimes(1);
    const movement = (
      stockMovements.record.mock.calls as unknown as [
        unknown,
        {
          reason: StockMovementReason;
          qty: number;
          qtyBefore: number;
          saleTransactionId: string;
        },
      ][]
    )[0][1];
    expect(movement.reason).toBe(StockMovementReason.SALE_REJECTED);
    expect(movement.qty).toBe(4);
    expect(movement.qtyBefore).toBe(6);
    expect(movement.saleTransactionId).toBe('sale-1');
  });

  it('is idempotent — a replayed rejection does not restore the stock twice', async () => {
    const alreadyRejected = new Date('2026-05-02T12:00:00Z');
    const { service, entry, stockMovements } = build({
      sale: { rejectedAt: alreadyRejected, rejectionReason: 'Wrong product' },
    });

    const result = await service.rejectSale(ownerCtx, 'sale-1', {
      reason: 'Wrong product again',
    });

    expect(entry!.quantityRemaining).toBe(6); // untouched
    expect(stockMovements.record).not.toHaveBeenCalled();
    expect(result.rejectedAt).toBe(alreadyRejected);
    expect(result.rejectionReason).toBe('Wrong product'); // original reason kept
  });

  it("refuses a sale on someone else's books", async () => {
    const { service } = build({ sale: { ownerId: 'someone-else' } });
    await expect(
      service.rejectSale(ownerCtx, 'sale-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still voids the sale when the lot has gone missing', async () => {
    const { service, stockMovements } = build({ entry: null });
    const result = await service.rejectSale(ownerCtx, 'sale-1', {});
    expect(result.rejectedAt).toBeInstanceOf(Date);
    expect(stockMovements.record).not.toHaveBeenCalled();
  });

  describe('mini employee', () => {
    it('rejects a sale from the open cycle', async () => {
      const { service, entry } = build({
        sale: { ownerId: MINI },
        entry: { ownerId: MINI },
        settlements: [
          null, // no PENDING handover
          {
            status: MiniSettlementStatus.APPROVED,
            approvedAt: new Date('2026-05-01T08:00:00Z'), // before the sale
          },
        ],
      });

      const result = await service.rejectSale(miniCtx, 'sale-1', {});
      expect(result.rejectedAt).toBeInstanceOf(Date);
      expect(entry!.quantityRemaining).toBe(10);
    });

    it('refuses while a handover is waiting for approval', async () => {
      const { service, entry } = build({
        sale: { ownerId: MINI },
        entry: { ownerId: MINI },
        settlements: [{ status: MiniSettlementStatus.PENDING }],
      });

      await expect(
        service.rejectSale(miniCtx, 'sale-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(entry!.quantityRemaining).toBe(6);
    });

    it('refuses a sale that was already handed over', async () => {
      const { service, entry } = build({
        sale: { ownerId: MINI },
        entry: { ownerId: MINI },
        settlements: [
          null,
          {
            status: MiniSettlementStatus.APPROVED,
            approvedAt: new Date('2026-05-03T08:00:00Z'), // after the sale
          },
        ],
      });

      await expect(
        service.rejectSale(miniCtx, 'sale-1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(entry!.quantityRemaining).toBe(6);
    });

    it('lets the owner reject a sale their mini already handed over', async () => {
      // The owner is not bound by the handover boundary — they own the books
      // and can correct anything on them.
      const { service, entry } = build({
        settlements: [
          {
            status: MiniSettlementStatus.APPROVED,
            approvedAt: new Date('2026-05-03T08:00:00Z'),
          },
        ],
      });
      const result = await service.rejectSale(ownerCtx, 'sale-1', {});
      expect(result.rejectedAt).toBeInstanceOf(Date);
      expect(entry!.quantityRemaining).toBe(10);
    });
  });
});
