import { branchTransfersStub } from '../common/testing/branch-transfers.fixture';
import Decimal from 'decimal.js';
import { SalesService } from '../sales/sales.service';
import { CustodyService } from './custody.service';
import {
  InventoryEntry,
  InventorySource,
  SaleTransaction,
  StockCustody,
  StockCustodyStatus,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';

/**
 * Custody must be **additive**. Everything that worked before this feature has
 * to keep working untouched, and the only way that is true by construction is
 * that `custodian_id IS NULL` — every lot that pre-dates custody, and every lot
 * at a branch where nobody was ever appointed — behaves exactly as it always
 * has.
 *
 * These tests wire the REAL `CustodyService` into the REAL `SalesService`,
 * rather than the stub the other sales specs use, so the integration point is
 * exercised rather than assumed.
 */

const ORG = 'org-1';
const SHOP = 'shop-1';
const OWNER = 'owner-1';
const CUSTODIAN = 'jean-1';
const OUTSIDER = 'paul-1';
const MINI = 'mini-1';

function ctxFor(
  actorId: string,
  over: Partial<ActorContext> = {},
): ActorContext {
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
    ...over,
  } as unknown as ActorContext;
}

const openCustody = (): StockCustody =>
  ({
    id: 'custody-1',
    orgId: ORG,
    shopId: SHOP,
    custodianId: CUSTODIAN,
    status: StockCustodyStatus.OPEN,
  }) as StockCustody;

function build(opts: {
  lot: Partial<InventoryEntry> & { source: InventorySource };
  custodies?: StockCustody[];
  teamMemberships?: { custodyId: string }[];
}) {
  const custodies = opts.custodies ?? [];

  // The real thing, with its repositories mocked — not a stub of its interface.
  const custody = new CustodyService(
    {
      find: jest.fn(async () => custodies),
      findOne: jest.fn(async () => custodies[0] ?? null),
    } as never,
    {} as never,
    { find: jest.fn(async () => opts.teamMemberships ?? []) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never, // consignmentRepo
    {} as never,
    {} as never,
   
   branchTransfersStub() as never,
  );

  const savedSales: SaleTransaction[] = [];
  const findLots = (o: { where: { source: InventorySource } }) =>
    o.where.source === opts.lot.source ? [opts.lot] : [];
  const manager = {
    save: jest.fn(async (Entity: unknown, obj: Record<string, unknown>) => {
      if (Entity === SaleTransaction) {
        if (!obj.id) obj.id = `sale-${savedSales.length + 1}`;
        savedSales.push(obj as unknown as SaleTransaction);
      }
      return obj;
    }),
    create: jest.fn((_E: unknown, obj: Record<string, unknown>) => ({ ...obj })),
    find: jest.fn(async (Entity: unknown, o: { where: { source: InventorySource } }) =>
      Entity === InventoryEntry ? findLots(o) : [],
    ),
    findOne: jest.fn(async () => null),
  };
  const entryRepo = {
    find: jest.fn(async (o: { where: { source: InventorySource } }) => findLots(o)),
  };
  const pricingService = {
    applyEmployeePriceRule: jest.fn(async (args: { submittedUnitPrice: string }) => ({
      effectiveUnitPrice: new Decimal(args.submittedUnitPrice).toFixed(4),
      standardPrice: null,
      capped: false,
      originalUnitPrice: null,
    })),
  };

  const service = new SalesService(
    { findOne: jest.fn(async () => null) } as never,
    entryRepo as never,
    { findOne: jest.fn(async () => null) } as never,
    { findOne: jest.fn(async () => null) } as never,
    { findOne: jest.fn(async () => null) } as never, // no open mini handover
    {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    } as never,
    { record: jest.fn(async () => ({})) } as never,
    pricingService as never,
    custody,
  );
  return { service, savedSales, custody };
}

const shelfLot = (over: Partial<InventoryEntry> = {}) =>
  ({
    id: 'e1',
    productName: 'rice',
    source: InventorySource.SUPPLIER,
    unitCost: '10.0000',
    sellingPrice: '20.0000',
    quantityRemaining: 50,
    ownerId: OWNER,
    orgId: ORG,
    shopId: SHOP,
    custodianId: null,
    supplierUserId: null,
    variantId: null,
    usdToFcRateSnapshot: null,
    ...over,
  }) as unknown as InventoryEntry & { source: InventorySource };

const dto = { productName: 'rice', qtySold: 2, salePrice: '20.0000' } as never;

describe('a branch where nobody was ever appointed behaves exactly as before', () => {
  it('records the sale and stamps it AUTO with no custody', async () => {
    const { service, savedSales } = build({ lot: shelfLot(), custodies: [] });
    await service.recordSale(ctxFor(OWNER), dto);

    expect(savedSales).toHaveLength(1);
    expect(savedSales[0].custodyId).toBeNull();
    expect(savedSales[0].approvalStatus).toBe('AUTO');
  });

  it('lets a full employee sell the shelf, as they always could', async () => {
    const { service, savedSales } = build({ lot: shelfLot(), custodies: [] });
    await service.recordSale(ctxFor(OUTSIDER), dto);
    expect(savedSales).toHaveLength(1);
    expect(savedSales[0].approvalStatus).toBe('AUTO');
  });

  it('treats an undefined custodian column as unassigned', async () => {
    // A lot built before the column existed, or by any code path that does not
    // set it, arrives as `undefined` rather than null. Both mean nobody holds
    // it — a strict `=== null` here silently hid every such lot from sale.
    const lot = shelfLot();
    delete (lot as { custodianId?: unknown }).custodianId;
    const { service, savedSales } = build({ lot, custodies: [] });
    await service.recordSale(ctxFor(OWNER), dto);
    expect(savedSales).toHaveLength(1);
  });
});

describe('an open custody does not disturb the rest of the branch', () => {
  it('still lets the owner sell an unassigned shelf lot', async () => {
    const { service, savedSales } = build({
      lot: shelfLot(),
      custodies: [openCustody()],
    });
    await service.recordSale(ctxFor(OWNER), dto);

    expect(savedSales).toHaveLength(1);
    // Unassigned stock is outside custody entirely, so nothing to attest to.
    expect(savedSales[0].custodyId).toBeNull();
    expect(savedSales[0].approvalStatus).toBe('AUTO');
  });

  it('still lets an employee who is on no team sell an unassigned shelf lot', async () => {
    const { service, savedSales } = build({
      lot: shelfLot(),
      custodies: [openCustody()],
    });
    await service.recordSale(ctxFor(OUTSIDER), dto);
    expect(savedSales).toHaveLength(1);
  });

  it("leaves a mini's own consigned lot alone", async () => {
    // A mini holds CONSIGNED_IN stock on their own books with `custodian_id`
    // null. Custody must be invisible to them, even at a branch that has a
    // custodian — their goods are not the shelf and not the custodian's volume.
    const { service, savedSales } = build({
      lot: shelfLot({
        source: InventorySource.CONSIGNED_IN,
        ownerId: MINI,
        unitCost: '15.0000',
      }),
      custodies: [openCustody()],
    });
    await service.recordSale(
      ctxFor(MINI, { tier: 'MINI_EMPLOYEE', effectiveOwnerId: MINI }),
      dto,
    );
    expect(savedSales).toHaveLength(1);
    expect(savedSales[0].approvalStatus).toBe('AUTO');
  });
});

describe('custody-held stock is the only thing custody changes', () => {
  it('hides a custodian\'s lot from an employee on nobody\'s team', async () => {
    const { service } = build({
      lot: shelfLot({ custodianId: CUSTODIAN }),
      custodies: [openCustody()],
    });
    await expect(service.recordSale(ctxFor(OUTSIDER), dto)).rejects.toThrow(/No stock found/);
  });

  it('lets the custodian sell it, stamped to the custody and self-attested', async () => {
    const { service, savedSales } = build({
      lot: shelfLot({ custodianId: CUSTODIAN }),
      custodies: [openCustody()],
    });
    await service.recordSale(ctxFor(CUSTODIAN), dto);

    expect(savedSales[0].custodyId).toBe('custody-1');
    expect(savedSales[0].approvalStatus).toBe('AUTO');
  });

  it("queues a teammate's sale of it for the man in charge", async () => {
    const { service, savedSales } = build({
      lot: shelfLot({ custodianId: CUSTODIAN }),
      custodies: [openCustody()],
      teamMemberships: [{ custodyId: 'custody-1' }],
    });
    await service.recordSale(ctxFor(OUTSIDER), dto);

    expect(savedSales[0].custodyId).toBe('custody-1');
    expect(savedSales[0].approvalStatus).toBe('PENDING');
  });
});
