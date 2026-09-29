import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CustodyHandoversService } from './custody-handovers.service';
import {
  CustodyAdjustmentKind,
  CustodyHandover,
  CustodyHandoverAdjustment,
  CustodyHandoverStatus,
  ExpenseCurrency,
  InventoryEntry,
  InventorySource,
  SaleApprovalStatus,
  SaleTransaction,
  StockCustody,
  StockCustodyStatus,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';

const ORG = 'org-1';
const SHOP = 'shop-1';
const OWNER = 'owner-1';
const CUSTODIAN = 'jean-1';
const OPENED = new Date('2026-09-01T08:00:00.000Z');

function ctxFor(actorId: string): ActorContext {
  return {
    actorId,
    effectiveOwnerId: OWNER,
    tier: actorId === OWNER ? 'OWNER' : 'FULL_EMPLOYEE',
    services: new Set(),
    employment: actorId === OWNER ? null : ({ employerId: OWNER, shopId: SHOP } as never),
    orgId: ORG,
    shopId: SHOP,
    visibleShopIds: [SHOP],
    shopScope: 'one',
    shopArchived: false,
  } as unknown as ActorContext;
}

const custody = {
  id: 'custody-1',
  orgId: ORG,
  shopId: SHOP,
  custodianId: CUSTODIAN,
  status: StockCustodyStatus.OPEN,
  openedAt: OPENED,
};

const sale = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 's1',
    productName: 'rice 50kg',
    variantLabel: null,
    qtySold: 2,
    salePrice: '30.0000',
    profit: '10.0000',
    usdToFcRateSnapshot: null,
    approvalStatus: SaleApprovalStatus.APPROVED,
    rejectedAt: null,
    rejectionReason: null,
    date: new Date('2026-09-02T10:00:00.000Z'),
    ...over,
  }) as never;

function build(opts: {
  sales?: unknown[];
  expenses?: unknown[];
  rate?: string;
  pendingHandover?: unknown;
  entry?: Partial<InventoryEntry>;
}) {
  const entry = {
    id: 'lot-1',
    source: InventorySource.SUPPLIER,
    productName: 'rice 50kg',
    unitCost: '25.0000',
    sellingPrice: '30.0000',
    category: null,
    quantityRemaining: 10,
    cartonPrice: null,
    piecesPerCarton: null,
    usdToFcRateSnapshot: null,
    ownerId: OWNER,
    orgId: ORG,
    shopId: SHOP,
    custodianId: CUSTODIAN,
    supplierUserId: null,
    supplierDebtId: null,
    groupId: null,
    variantId: null,
    variant: null,
    ...opts.entry,
  } as unknown as InventoryEntry;

  const saved: Record<string, unknown>[] = [];
  const handoverRepo = {
    findOne: jest.fn(async (args: { where: { status?: string } }) =>
      args.where.status === CustodyHandoverStatus.PENDING ? (opts.pendingHandover ?? null) : null,
    ),
    find: jest.fn(async () => []),
    create: jest.fn((data: Record<string, unknown>) => data),
    save: jest.fn(async (data: Record<string, unknown>) => {
      saved.push(data);
      return data;
    }),
  };

  const service = new CustodyHandoversService(
    handoverRepo as never,
    {} as never,
    { findOne: jest.fn(async () => custody) } as never,
    { find: jest.fn(async () => [entry]), findOne: jest.fn(async () => entry) } as never,
    { find: jest.fn(async () => opts.sales ?? []) } as never,
    { find: jest.fn(async () => opts.expenses ?? []) } as never,
    { find: jest.fn(async () => []) } as never, // consignmentRepo,
    { find: jest.fn(async () => []) } as never, // settlementRepo,
    {} as never,
    {} as never,
    { getRate: jest.fn(async () => ({ usdToFcRate: opts.rate ?? '2700.0000' })) } as never);
  return { service, saved, entry, handoverRepo };
}

describe('CustodyHandoversService.preview — what the books expect back', () => {
  it('values sales at the system rate and nets off what was spent from the till', async () => {
    const { service } = build({
      sales: [sale()],
      expenses: [{ amount: '12000.0000', currency: ExpenseCurrency.FC, usdToFcRateSnapshot: null }],
    });
    const preview = await service.preview(ctxFor(CUSTODIAN));

    // 2 × 30 USD × 2700 = 162 000 FC taken, less 12 000 FC spent.
    expect(preview?.salesFc).toBe('162000.0000');
    expect(preview?.expensesFc).toBe('12000.0000');
    expect(preview?.cashExpectedFc).toBe('150000.0000');
  });

  it("uses a sale's own locked rate in preference to the live one", async () => {
    const { service } = build({ sales: [sale({ usdToFcRateSnapshot: '2000.0000' })], rate: '2700.0000' });
    const preview = await service.preview(ctxFor(CUSTODIAN));
    expect(preview?.salesFc).toBe('120000.0000');
  });

  it('lists a voided sale without charging for it', async () => {
    // Business rule 9: the goods went back on the shelf, so they are already in
    // the returns. Counting the money too would bill the custodian twice.
    const { service } = build({
      sales: [sale({ rejectedAt: new Date('2026-09-03T09:00:00.000Z'), rejectionReason: 'wrong item' })],
    });
    const preview = await service.preview(ctxFor(CUSTODIAN));

    expect(preview?.salesFc).toBe('0.0000');
    expect(preview?.rejectedLines).toHaveLength(1);
    expect(preview?.rejectedLines[0].reason).toBe('wrong item');
    expect(preview?.soldLines).toHaveLength(0);
  });

  it('counts what is still awaiting the custodian\'s own approval', async () => {
    const { service } = build({
      sales: [sale(), sale({ id: 's2', approvalStatus: SaleApprovalStatus.PENDING })],
    });
    const preview = await service.preview(ctxFor(CUSTODIAN));
    expect(preview?.unattestedSaleCount).toBe(1);
  });

  it("carries the sold lot's piecesPerCarton onto the sold line, for a cartons/pieces breakdown", async () => {
    const { service } = build({
      sales: [sale({ inventoryEntry: { piecesPerCarton: 24 } })],
    });
    const preview = await service.preview(ctxFor(CUSTODIAN));
    expect(preview?.soldLines[0].piecesPerCarton).toBe(24);
  });

  it('reports the holding lots with their piecesPerCarton too', async () => {
    const { service } = build({ entry: { piecesPerCarton: 12 } });
    const preview = await service.preview(ctxFor(CUSTODIAN));
    expect(preview?.holding[0].piecesPerCarton).toBe(12);
  });
});

describe('CustodyHandoversService.submit', () => {
  it('refuses to close a period the man in charge has not gone through', async () => {
    const { service } = build({
      sales: [sale({ approvalStatus: SaleApprovalStatus.PENDING })],
    });
    await expect(
      service.submit(ctxFor(CUSTODIAN), { cashDeclaredFc: '100000.0000' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second handover while one is already awaiting approval', async () => {
    const { service } = build({ pendingHandover: { id: 'h-open' } });
    await expect(
      service.submit(ctxFor(CUSTODIAN), { cashDeclaredFc: '1.0000' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('seals the figures and the lines onto the row', async () => {
    const { service, saved } = build({ sales: [sale()] });
    await service.submit(ctxFor(CUSTODIAN), { cashDeclaredFc: '160000.0000' });

    const row = saved[0];
    expect(row.cashDeclaredFc).toBe('160000.0000');
    expect(row.cashExpectedFc).toBe('162000.0000');
    // Snapshotted, not re-derived at read time: a later rate move, rename or
    // post-close rejection must not rewrite a document both parties signed off.
    expect(row.soldLines).toEqual([
      expect.objectContaining({ productName: 'rice 50kg', qtySold: 2, valueFc: '162000.0000' }),
    ]);
    expect(row.periodStart).toBe(OPENED);
  });

  it('always declares everything currently held, at full quantity — there is no partial handover', async () => {
    const { service, saved } = build({});
    await service.submit(ctxFor(CUSTODIAN), { cashDeclaredFc: '0.0000' });
    expect(saved[0].items).toEqual([
      expect.objectContaining({ quantity: 10, unitCost: '25.0000', inventoryEntryId: 'lot-1' }),
    ]);
  });

  it('declares nothing when the custodian is already holding nothing', async () => {
    const { service, saved } = build({ entry: { quantityRemaining: 0 } });
    await service.submit(ctxFor(CUSTODIAN), { cashDeclaredFc: '0.0000' });
    expect(saved[0].items).toEqual([]);
  });
});

describe('CustodyHandoversService.approve', () => {
  function approvalSetup(
    opts: {
      adjustments?: unknown[];
      items?: unknown[];
      /** Lots left with `custodianId` still set, post-return. Empty = hands empty. */
      stillHeld?: Partial<InventoryEntry>[];
      unattestedCount?: number;
      custody?: Partial<typeof custody>;
    } = {},
  ) {
    const lot = {
      id: 'lot-1',
      source: InventorySource.SUPPLIER,
      productName: 'rice 50kg',
      unitCost: '25.0000',
      sellingPrice: '30.0000',
      category: null,
      quantityRemaining: 10,
      cartonPrice: null,
      piecesPerCarton: null,
      usdToFcRateSnapshot: null,
      ownerId: OWNER,
      orgId: ORG,
      shopId: SHOP,
      custodianId: CUSTODIAN,
      supplierUserId: null,
      supplierDebtId: null,
      groupId: null,
      variantId: null,
    } as unknown as InventoryEntry;

    const handover = {
      id: 'h1',
      orgId: ORG,
      shopId: SHOP,
      custodyId: 'custody-1',
      custodianId: CUSTODIAN,
      status: CustodyHandoverStatus.PENDING,
      items: opts.items ?? [
        { inventoryEntryId: 'lot-1', quantity: 4, productName: 'rice 50kg' },
      ],
      adjustments: [],
    } as unknown as CustodyHandover;

    const custodyRow = { ...custody, ...opts.custody };
    const createdEntries: InventoryEntry[] = [];
    let savedCustody: Record<string, unknown> | null = null;
    const manager = {
      find: jest.fn(async (entity: unknown) => {
        if (entity === CustodyHandoverAdjustment) return opts.adjustments ?? [];
        if (entity === InventoryEntry) return opts.stillHeld ?? [];
        return [];
      }),
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === StockCustody) return { ...custodyRow };
        return lot;
      }),
      count: jest.fn(async () => opts.unattestedCount ?? 0),
      create: jest.fn((_e: unknown, data: InventoryEntry) => data),
      save: jest.fn(async (entity: unknown, data: unknown) => {
        if (entity === InventoryEntry && (data as InventoryEntry).quantityOriginal !== undefined) {
          createdEntries.push(data as InventoryEntry);
        }
        if (entity === StockCustody) {
          savedCustody = data as Record<string, unknown>;
        }
        return data;
      }),
    };
    const stockMovements = { record: jest.fn(async (..._a: unknown[]) => ({})) };

    const service = new CustodyHandoversService(
      { findOne: jest.fn(async () => handover), save: jest.fn(async (d: unknown) => d) } as never,
      {} as never,
      {} as never,
      { findOne: jest.fn(async () => lot) } as never,
      {} as never,
      {} as never,
    { find: jest.fn(async () => []) } as never, // consignmentRepo,
    { find: jest.fn(async () => []) } as never, // settlementRepo,
      {
        transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
      } as never,
      stockMovements as never,
      {} as never);
    return {
      service,
      handover,
      lot,
      createdEntries,
      stockMovements,
      getSavedCustody: () => savedCustody,
    };
  }

  it('refuses to let the custodian approve their own handover', async () => {
    const { service } = approvalSetup();
    await expect(service.approve(ctxFor(CUSTODIAN), 'h1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('puts the returned goods back on the unassigned shelf at their original cost', async () => {
    const { service, lot, createdEntries } = approvalSetup();
    await service.approve(ctxFor(OWNER), 'h1');

    expect(lot.quantityRemaining).toBe(6);
    expect(createdEntries).toHaveLength(1);
    expect(createdEntries[0].custodianId).toBeNull();
    expect(createdEntries[0].unitCost).toBe('25.0000');
    expect(createdEntries[0].quantityRemaining).toBe(4);
  });

  it('records both legs of the return', async () => {
    const { service, stockMovements } = approvalSetup();
    await service.approve(ctxFor(OWNER), 'h1');
    const reasons = stockMovements.record.mock.calls.map(
      (c) => (c[1] as { reason: string }).reason,
    );
    expect(reasons).toEqual(['CUSTODY_RETURN_OUT', 'CUSTODY_RETURN_IN']);
  });

  it("turns the owner's hand-written shortage into a typed stock movement", async () => {
    const { service, stockMovements } = approvalSetup({
      items: [],
      adjustments: [
        {
          kind: CustodyAdjustmentKind.ITEM_MISSING,
          inventoryEntryId: 'lot-1',
          quantity: 3,
          note: 'three bags short',
        } as unknown as CustodyHandoverAdjustment,
      ],
    });
    await service.approve(ctxFor(OWNER), 'h1');

    const calls = stockMovements.record.mock.calls.map((c) => c[1] as { reason: string; qty: number });
    expect(calls).toEqual([expect.objectContaining({ reason: 'LOSS', qty: 3 })]);
  });

  it('writes no stock movement for a cash line', async () => {
    // §3.8: a cash shortage is the record and this handover's net. It never
    // silently moves the branch's stock or cash position.
    const { service, stockMovements } = approvalSetup({
      items: [],
      adjustments: [
        {
          kind: CustodyAdjustmentKind.CASH_SHORT,
          amountFc: '5000.0000',
          inventoryEntryId: null,
          quantity: null,
          note: 'short',
        } as unknown as CustodyHandoverAdjustment,
      ],
    });
    await service.approve(ctxFor(OWNER), 'h1');
    expect(stockMovements.record).not.toHaveBeenCalled();
  });

  it('refuses a handover that has already been settled', async () => {
    const { service, handover } = approvalSetup();
    handover.status = CustodyHandoverStatus.APPROVED;
    await expect(service.approve(ctxFor(OWNER), 'h1')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('closing the custody once approval empties their hands', () => {
    it('closes it when nothing is left and no sale is unattested', async () => {
      const { service, getSavedCustody } = approvalSetup();
      await service.approve(ctxFor(OWNER), 'h1');
      expect(getSavedCustody()).toEqual(
        expect.objectContaining({ status: StockCustodyStatus.CLOSED }),
      );
    });

    it('leaves it open if stock landed on their books between submission and approval', async () => {
      const { service, getSavedCustody } = approvalSetup({
        stillHeld: [{ quantityRemaining: 3 } as InventoryEntry],
      });
      await service.approve(ctxFor(OWNER), 'h1');
      expect(getSavedCustody()).toBeNull();
    });

    it('leaves it open while a sale is still unattested', async () => {
      const { service, getSavedCustody } = approvalSetup({ unattestedCount: 1 });
      await service.approve(ctxFor(OWNER), 'h1');
      expect(getSavedCustody()).toBeNull();
    });

    it('does nothing to a custody that is already closed', async () => {
      const { service, getSavedCustody } = approvalSetup({
        custody: { status: StockCustodyStatus.CLOSED },
      });
      await service.approve(ctxFor(OWNER), 'h1');
      expect(getSavedCustody()).toBeNull();
    });
  });
});
