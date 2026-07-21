import { MiniSettlementsService } from './mini-settlements.service';
import {
  DebtorCredit,
  InventoryEntry,
  InventorySource,
  MiniSettlementStatus,
  Payment,
  PaymentDirection,
  PaymentStatus,
  SupplierDebt,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';

/**
 * Unit-level coverage of the money math in approve(): a mini consigned 20 units
 * at an agreed price of 32.00 (owner cost 25.00), sold 15 and returns 5. The
 * handover cash is 15 × 32 = 480.00. After approval the debt must fully settle:
 *   returns reverse 5 × 32 = 160 off totalCreditGiven + outstanding,
 *   cash books 480 into totalReceived and clears outstanding to 0.
 */
describe('MiniSettlementsService.approve', () => {
  const OWNER = 'owner-1';
  const MINI = 'mini-1';

  function build(personalLot: Record<string, unknown> | null = null) {
    const credit = {
      id: 'credit-1',
      ownerId: OWNER,
      debtorUserId: MINI,
      totalCreditGiven: '640.0000',
      totalReceived: '0.0000',
      outstandingBalance: '640.0000',
    };
    const debt = {
      id: 'debt-1',
      ownerId: MINI,
      supplierUserId: OWNER,
      totalCreditReceived: '640.0000',
      totalPaid: '0.0000',
      outstandingBalance: '640.0000',
    };
    const miniInEntry = {
      id: 'in-1',
      ownerId: MINI,
      productName: 'rice',
      source: InventorySource.CONSIGNED_IN,
      unitCost: '32.0000',
      quantityRemaining: 5,
    };
    const ownerOutEntry = {
      id: 'out-1',
      ownerId: OWNER,
      productName: 'rice',
      source: InventorySource.CONSIGNED_OUT,
      unitCost: '25.0000',
      sellingPrice: '32.0000',
      quantityRemaining: 20,
    };

    const savedPayments: Payment[] = [];
    const manager = {
      findOne: jest.fn(async (Entity: unknown, opts?: { where?: { source?: InventorySource } }) => {
        if (Entity === DebtorCredit) return credit;
        if (Entity === SupplierDebt) return debt;
        if (Entity === InventoryEntry) {
          return opts?.where?.source === InventorySource.PERSONAL ? personalLot : null;
        }
        return null;
      }),
      find: jest.fn(async (_Entity: unknown, opts: { where?: { source?: InventorySource } }) => {
        const src = opts?.where?.source;
        if (src === InventorySource.CONSIGNED_IN) return [miniInEntry];
        if (src === InventorySource.CONSIGNED_OUT) return [ownerOutEntry];
        return [];
      }),
      create: jest.fn((_Entity: unknown, obj: Record<string, unknown>) => ({ ...obj })),
      save: jest.fn(async (Entity: unknown, obj: Record<string, unknown>) => {
        if (Entity === Payment) savedPayments.push(obj as unknown as Payment);
        if (!obj.id) obj.id = 'generated-id';
        return obj;
      }),
    };

    const settlement = {
      id: 'settle-1',
      ownerId: OWNER,
      miniId: MINI,
      status: MiniSettlementStatus.PENDING,
      cashAmount: '480.0000',
      note: null as string | null,
      paymentId: null as string | null,
      approvedAt: null as Date | null,
      actorId: null as string | null,
      items: [
        { id: 'item-1', productName: 'rice', quantity: 5, agreedUnitPrice: '32.0000', unitCost: null as string | null },
      ],
    };

    const settlementRepo = { findOne: jest.fn(async () => settlement) };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    };
    const stockMovements = { record: jest.fn(async () => ({})) };
    const currencyService = { getRate: jest.fn(async () => ({ usdToFcRate: '2700', sellingRate: null })) };

    const service = new MiniSettlementsService(
      settlementRepo as never, // settlementRepo
      {} as never, // itemRepo
      {} as never, // entryRepo
      {} as never, // debtorCreditRepo
      {} as never, // supplierDebtRepo
      {} as never, // saleRepo
      {} as never, // employmentRepo
      {} as never, // miniExpenseRepo
      dataSource as never,
      stockMovements as never,
      currencyService as never,
      {} as never, // variantRepo
    );

    return { service, credit, debt, settlement, savedPayments, miniInEntry, ownerOutEntry, manager };
  }

  const ctx: ActorContext = {
    actorId: OWNER,
    effectiveOwnerId: OWNER,
    tier: 'OWNER',
    employment: null,
  };

  it('reverses returned-unit debt and books the cash, clearing the balance', async () => {
    const { service, credit, debt, settlement, savedPayments } = build();

    const result = await service.approve(ctx, 'settle-1');

    // Returns reverse 5 × 32 = 160 off given + outstanding; cash books 480.
    expect(credit.totalCreditGiven).toBe('480.0000');
    expect(credit.totalReceived).toBe('480.0000');
    expect(credit.outstandingBalance).toBe('0.0000');

    // Mirror debt on the mini's books settles the same way.
    expect(debt.totalCreditReceived).toBe('480.0000');
    expect(debt.totalPaid).toBe('480.0000');
    expect(debt.outstandingBalance).toBe('0.0000');

    // One aggregate debtor payment, differentiated from direct sales.
    expect(savedPayments).toHaveLength(1);
    expect(savedPayments[0].amount).toBe('480.0000');
    expect(savedPayments[0].direction).toBe(PaymentDirection.DEBTOR_TO_OWNER);
    expect(savedPayments[0].status).toBe(PaymentStatus.APPROVED);

    expect(result.status).toBe(MiniSettlementStatus.APPROVED);
    expect(settlement.paymentId).toBe('generated-id');
  });

  it('deducts the returned qty from mini stock and re-stocks the owner', async () => {
    const { service, miniInEntry, ownerOutEntry } = build();

    await service.approve(ctx, 'settle-1');

    // Mini's CONSIGNED_IN 5 → 0; owner's CONSIGNED_OUT tracking 20 → 15.
    expect(miniInEntry.quantityRemaining).toBe(0);
    expect(ownerOutEntry.quantityRemaining).toBe(15);
  });

  it('clears the balance exactly when returned units span batches at different agreed prices', async () => {
    // Mini holds two "rice" batches: 3 @ 32 (given first) and 4 @ 40. They sold
    // 1 (from the 40 batch) and return the remaining 7. Cash = 1 × 40 = 40.
    // Total debt = 3×32 + 5×40 = 296. A single-price return valuation (7 × 32 =
    // 224) would leave a 32.00 residual; per-lot (3×32 + 4×40 = 256) clears it.
    const credit = {
      id: 'credit-1',
      ownerId: OWNER,
      debtorUserId: MINI,
      totalCreditGiven: '296.0000',
      totalReceived: '0.0000',
      outstandingBalance: '296.0000',
    };
    const debt = {
      id: 'debt-1',
      ownerId: MINI,
      supplierUserId: OWNER,
      totalCreditReceived: '296.0000',
      totalPaid: '0.0000',
      outstandingBalance: '296.0000',
    };
    const lotA = { id: 'in-a', ownerId: MINI, productName: 'rice', source: InventorySource.CONSIGNED_IN, unitCost: '32.0000', quantityRemaining: 3 };
    const lotB = { id: 'in-b', ownerId: MINI, productName: 'rice', source: InventorySource.CONSIGNED_IN, unitCost: '40.0000', quantityRemaining: 4 };
    const ownerOutEntry = { id: 'out-1', ownerId: OWNER, productName: 'rice', source: InventorySource.CONSIGNED_OUT, unitCost: '25.0000', sellingPrice: '32.0000', quantityRemaining: 8 };
    const personalLot = { id: 'personal-1', ownerId: OWNER, productName: 'rice', source: InventorySource.PERSONAL, unitCost: '25.0000', sellingPrice: '40.0000', quantityOriginal: 2, quantityRemaining: 2 };

    const manager = {
      findOne: jest.fn(async (Entity: unknown, opts?: { where?: { source?: InventorySource } }) => {
        if (Entity === DebtorCredit) return credit;
        if (Entity === SupplierDebt) return debt;
        if (Entity === InventoryEntry) return opts?.where?.source === InventorySource.PERSONAL ? personalLot : null;
        return null;
      }),
      find: jest.fn(async (_Entity: unknown, opts: { where?: { source?: InventorySource } }) => {
        const src = opts?.where?.source;
        if (src === InventorySource.CONSIGNED_IN) return [lotA, lotB]; // FIFO: A then B
        if (src === InventorySource.CONSIGNED_OUT) return [ownerOutEntry];
        return [];
      }),
      create: jest.fn((_Entity: unknown, obj: Record<string, unknown>) => ({ ...obj })),
      save: jest.fn(async (_Entity: unknown, obj: Record<string, unknown>) => {
        if (!obj.id) obj.id = 'generated-id';
        return obj;
      }),
    };
    const settlement = {
      id: 'settle-1', ownerId: OWNER, miniId: MINI, status: MiniSettlementStatus.PENDING,
      cashAmount: '40.0000', note: null as string | null, paymentId: null as string | null,
      approvedAt: null as Date | null, actorId: null as string | null,
      // Single return line for 7 units, snapshot price = oldest lot (32) — the
      // exact case the per-lot fix corrects.
      items: [{ id: 'item-1', productName: 'rice', quantity: 7, agreedUnitPrice: '32.0000', unitCost: null as string | null }],
    };
    const settlementRepo = { findOne: jest.fn(async () => settlement) };
    const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)) };
    const stockMovements = { record: jest.fn(async () => ({})) };
    const currencyService = { getRate: jest.fn(async () => ({ usdToFcRate: '2700', sellingRate: null })) };
    const service = new MiniSettlementsService(
      settlementRepo as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, dataSource as never, stockMovements as never, currencyService as never,
      {} as never, // variantRepo
    );

    await service.approve(ctx, 'settle-1');

    // Returns reverse 3×32 + 4×40 = 256; cash books 40 → balance is exactly 0.
    expect(credit.totalCreditGiven).toBe('40.0000');
    expect(credit.outstandingBalance).toBe('0.0000');
    expect(debt.outstandingBalance).toBe('0.0000');
    // Both mini lots drained to 0.
    expect(lotA.quantityRemaining).toBe(0);
    expect(lotB.quantityRemaining).toBe(0);
  });

  it('returns bump the quantity on the owner\'s existing lot, leaving prices untouched', async () => {
    // Owner already has a PERSONAL lot for "rice" priced at their own numbers.
    const personalLot = {
      id: 'personal-1',
      ownerId: OWNER,
      productName: 'rice',
      source: InventorySource.PERSONAL,
      unitCost: '25.0000',
      sellingPrice: '40.0000', // the owner's OWN price, NOT the mini's agreed 32
      quantityOriginal: 10,
      quantityRemaining: 10,
    };
    const { service, manager } = build(personalLot);

    await service.approve(ctx, 'settle-1');

    // Quantity increased by the 5 returned units...
    expect(personalLot.quantityRemaining).toBe(15);
    expect(personalLot.quantityOriginal).toBe(15);
    // ...but the owner's prices are untouched (no re-stamp at the mini's price).
    expect(personalLot.sellingPrice).toBe('40.0000');
    expect(personalLot.unitCost).toBe('25.0000');
    // And no fresh PERSONAL lot was created for the return.
    const createdPersonal = (manager.create as jest.Mock).mock.calls.some(
      (c) => (c[1] as { source?: InventorySource })?.source === InventorySource.PERSONAL,
    );
    expect(createdPersonal).toBe(false);
  });
});

/**
 * A mini hands back cash *and* the unsold goods, but stock only leaves their
 * books on approval. A second PENDING handover would therefore re-snapshot the
 * same still-undeducted CONSIGNED_IN lots and claim the same units twice, so
 * create() must refuse while one is open.
 */
describe('MiniSettlementsService.create — one open handover at a time', () => {
  const MINI = 'mini-1';
  const OWNER = 'owner-1';

  const ctx: ActorContext = {
    actorId: MINI,
    effectiveOwnerId: MINI, // a mini operates on their own books
    tier: 'MINI_EMPLOYEE',
    employment: { employerId: OWNER } as never,
  };

  function build(openHandover: unknown) {
    const settlementRepo = {
      findOne: jest.fn(async () => openHandover),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (v: unknown) => ({ ...(v as object), id: 's-new' })),
    };
    const entryRepo = { find: jest.fn(async () => []) };
    const variantRepo = { find: jest.fn(async () => []) };
    const miniExpenseRepo = { update: jest.fn(async () => ({})) };
    // create() now snapshots the sold lines via computeSoldLines → needs a sale
    // query builder and the currency rate. No sales here, so it yields [].
    const saleQb = {
      where: jest.fn(() => saleQb),
      andWhere: jest.fn(() => saleQb),
      getMany: jest.fn(async () => []),
    };
    const saleRepo = { createQueryBuilder: jest.fn(() => saleQb) };
    const currencyService = {
      getRate: jest.fn(async () => ({ usdToFcRate: '2700', sellingRate: null })),
    };
    const service = new MiniSettlementsService(
      settlementRepo as never,
      { create: jest.fn((v: unknown) => v) } as never, // itemRepo
      entryRepo as never,
      {} as never, // debtorCreditRepo
      {} as never, // supplierDebtRepo
      saleRepo as never,
      {} as never, // employmentRepo
      miniExpenseRepo as never,
      {} as never, // dataSource
      {} as never, // stockMovements
      currencyService as never,
      variantRepo as never,
    );
    return { service, settlementRepo };
  }

  it('rejects a second handover while one is awaiting approval', async () => {
    const { service } = build({ id: 's-open', status: MiniSettlementStatus.PENDING });
    await expect(service.create(ctx, { cashAmount: '100.0000' })).rejects.toThrow(
      /already have a handover waiting for approval/i,
    );
  });

  it('allows a handover when none is open', async () => {
    const { service, settlementRepo } = build(null);
    const saved = await service.create(ctx, { cashAmount: '100.0000' });
    expect(saved).toMatchObject({ id: 's-new', status: MiniSettlementStatus.PENDING });
    expect(settlementRepo.findOne).toHaveBeenCalledWith({
      where: { miniId: MINI, status: MiniSettlementStatus.PENDING },
    });
  });
});
