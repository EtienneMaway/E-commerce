import { branchTransfersStub } from '../common/testing/branch-transfers.fixture';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CustodyService } from './custody.service';
import {
  EmploymentStatus,
  EmploymentTier,
  InventoryEntry,
  InventorySource,
  SaleApprovalStatus,
  StockCustody,
  StockCustodyStatus,
  StockIssue,
  StockIssueStatus,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';

const ORG = 'org-1';
const SHOP = 'shop-1';
const OWNER = 'owner-1';
const CUSTODIAN = 'jean-1';
const TEAMMATE = 'marie-1';
const OUTSIDER = 'paul-1';

function ctxFor(actorId: string, opts: { asEmployee?: boolean } = {}): ActorContext {
  return {
    actorId,
    effectiveOwnerId: OWNER,
    tier: opts.asEmployee ? 'FULL_EMPLOYEE' : 'OWNER',
    services: new Set(),
    employment: opts.asEmployee ? ({ employerId: OWNER, shopId: SHOP } as never) : null,
    orgId: ORG,
    shopId: SHOP,
    visibleShopIds: [SHOP],
    shopScope: 'one',
    shopArchived: false,
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

describe('CustodyService — appointment', () => {
  it('refuses a second custodian at a branch that already has one', async () => {
    const service = new CustodyService(
      { findOne: jest.fn(async () => openCustody()) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: jest.fn(async () => ({
          employeeId: CUSTODIAN,
          tier: EmploymentTier.FULL,
          status: EmploymentStatus.ACTIVE,
          shopId: SHOP,
        })),
      } as never,
    {} as never, // consignmentRepo
      {} as never,
      {} as never,
     
     branchTransfersStub() as never,
  );

    await expect(
      service.appoint(ctxFor(OWNER), { custodianId: CUSTODIAN }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to put a mini employee in charge — the tier is the ceiling', async () => {
    const service = new CustodyService(
      { findOne: jest.fn(async () => null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: jest.fn(async () => ({
          employeeId: 'mini-1',
          tier: EmploymentTier.SALES_ONLY,
          status: EmploymentStatus.ACTIVE,
          shopId: SHOP,
        })),
      } as never,
    {} as never, // consignmentRepo
      {} as never,
      {} as never,
     
     branchTransfersStub() as never,
  );

    await expect(
      service.appoint(ctxFor(OWNER), { custodianId: 'mini-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CustodyService.acceptIssue', () => {
  function setup() {
    const sourceLot: InventoryEntry = {
      id: 'lot-1',
      source: InventorySource.SUPPLIER,
      productName: 'rice 50kg',
      unitCost: '25.0000',
      sellingPrice: '30.0000',
      category: 'Grains',
      quantityOriginal: 100,
      quantityRemaining: 100,
      cartonPrice: null,
      piecesPerCarton: null,
      usdToFcRateSnapshot: null,
      ownerId: OWNER,
      orgId: ORG,
      shopId: SHOP,
      custodianId: null,
      supplierUserId: 'supplier-1',
      supplierDebtId: 'debt-1',
      groupId: null,
      variantId: null,
    } as unknown as InventoryEntry;

    const issue = {
      id: 'issue-1',
      custodyId: 'custody-1',
      status: StockIssueStatus.PENDING,
      custody: openCustody(),
      items: [
        {
          productName: 'rice 50kg',
          quantity: 20,
          variantId: null,
          sourceEntryId: 'lot-1',
        },
      ],
    } as unknown as StockIssue;

    const created: InventoryEntry[] = [];
    const manager = {
      findOne: jest.fn(async (entity: unknown) =>
        entity === StockCustody ? openCustody() : sourceLot,
      ),
      find: jest.fn(async () => [sourceLot]),
      create: jest.fn((_entity: unknown, data: InventoryEntry) => data),
      save: jest.fn(async (entity: unknown, data: unknown) => {
        if (entity === InventoryEntry && (data as InventoryEntry).custodianId) {
          created.push(data as InventoryEntry);
        }
        return data;
      }),
    };
    const stockMovements = { record: jest.fn(async (..._args: unknown[]) => ({})) };

    const service = new CustodyService(
      {} as never,
      { findOne: jest.fn(async () => issue), save: jest.fn(async (i: unknown) => i) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    {} as never, // consignmentRepo
      {
        transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
      } as never,
      stockMovements as never, branchTransfersStub() as never);
    return { service, sourceLot, created, stockMovements };
  }

  it("carries the lot's own cost onto the custody entry, never re-basing it", async () => {
    const { service, created } = setup();
    await service.acceptIssue(ctxFor(CUSTODIAN, { asEmployee: true }), 'issue-1');

    expect(created).toHaveLength(1);
    // The heart of SHOP_CUSTODY_PLAN.md §3.1. A mini's CONSIGNED_IN lot re-bases
    // unitCost to the agreed price, which is why a mini's sale shows the mini's
    // margin. Custody must NOT: the goods stay the owner's, so the owner's
    // profit on his employee's sale has to be the real profit at the real cost.
    expect(created[0].unitCost).toBe('25.0000');
    expect(created[0].source).toBe(InventorySource.SUPPLIER);
    expect(created[0].ownerId).toBe(OWNER);
    expect(created[0].custodianId).toBe(CUSTODIAN);
    expect(created[0].quantityRemaining).toBe(20);
  });

  it('moves the quantity rather than duplicating it', async () => {
    const { service, sourceLot, created } = setup();
    await service.acceptIssue(ctxFor(CUSTODIAN, { asEmployee: true }), 'issue-1');

    expect(sourceLot.quantityRemaining).toBe(80);
    expect(sourceLot.quantityRemaining + created[0].quantityRemaining).toBe(100);
  });

  it('records both legs of the move', async () => {
    const { service, stockMovements } = setup();
    await service.acceptIssue(ctxFor(CUSTODIAN, { asEmployee: true }), 'issue-1');

    const reasons = stockMovements.record.mock.calls.map((c) => (c[1] as { reason: string }).reason);
    expect(reasons).toEqual(['CUSTODY_OUT', 'CUSTODY_IN']);
  });
});

describe('CustodyService.allowedCustodianIds — who may touch the stock', () => {
  function serviceFor(actorId: string, memberships: { custodyId: string }[]) {
    return new CustodyService(
      { find: jest.fn(async () => [openCustody()]) } as never,
      {} as never,
      { find: jest.fn(async () => memberships) } as never,
      {} as never,
      {} as never,
      {} as never,
    {} as never, // consignmentRepo
      {} as never,
      {} as never,
     
     branchTransfersStub() as never,
  );
  }

  it('lets the custodian sell their own volume', async () => {
    const allowed = await serviceFor(CUSTODIAN, []).allowedCustodianIds(
      ctxFor(CUSTODIAN, { asEmployee: true }),
    );
    expect(allowed.has(CUSTODIAN)).toBe(true);
  });

  it('lets someone on the team sell it', async () => {
    const allowed = await serviceFor(TEAMMATE, [{ custodyId: 'custody-1' }]).allowedCustodianIds(
      ctxFor(TEAMMATE, { asEmployee: true }),
    );
    expect(allowed.has(CUSTODIAN)).toBe(true);
  });

  it('shuts out an employee who is on nobody\'s team', async () => {
    const allowed = await serviceFor(OUTSIDER, []).allowedCustodianIds(
      ctxFor(OUTSIDER, { asEmployee: true }),
    );
    expect(allowed.has(CUSTODIAN)).toBe(false);
    expect(allowed.size).toBe(0);
  });

  it('never bounds the owner — they are his goods either way', async () => {
    const allowed = await serviceFor(OWNER, []).allowedCustodianIds(ctxFor(OWNER));
    expect(allowed.has(CUSTODIAN)).toBe(true);
  });
});

describe('CustodyService.saleStamp — who has to be attested to', () => {
  function service() {
    return new CustodyService(
      { findOne: jest.fn(async () => openCustody()) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    {} as never, // consignmentRepo
      {} as never,
      {} as never,
     
     branchTransfersStub() as never,
  );
  }
  const heldLot = {
    orgId: ORG,
    shopId: SHOP,
    custodianId: CUSTODIAN,
  } as InventoryEntry;

  it("leaves the owner's own sale alone — he cannot cheat himself", async () => {
    const stamp = await service().saleStamp(ctxFor(OWNER), heldLot);
    expect(stamp.approvalStatus).toBe(SaleApprovalStatus.AUTO);
    expect(stamp.custodyId).toBe('custody-1');
  });

  it('leaves the custodian\'s own sale alone — he is the one who attests', async () => {
    const stamp = await service().saleStamp(ctxFor(CUSTODIAN, { asEmployee: true }), heldLot);
    expect(stamp.approvalStatus).toBe(SaleApprovalStatus.AUTO);
  });

  it("queues a team member's sale for the man in charge", async () => {
    const stamp = await service().saleStamp(ctxFor(TEAMMATE, { asEmployee: true }), heldLot);
    expect(stamp.approvalStatus).toBe(SaleApprovalStatus.PENDING);
    expect(stamp.custodyId).toBe('custody-1');
  });

  it('leaves an unassigned lot out of custody entirely', async () => {
    const stamp = await service().saleStamp(ctxFor(TEAMMATE, { asEmployee: true }), {
      orgId: ORG,
      shopId: SHOP,
      custodianId: null,
    } as InventoryEntry);
    expect(stamp.custodyId).toBeNull();
    expect(stamp.approvalStatus).toBe(SaleApprovalStatus.AUTO);
  });
});

describe('CustodyService.approveSales — the batch warning', () => {
  function serviceWith(found: { id: string }[]) {
    return new CustodyService(
      { findOne: jest.fn(async () => openCustody()) } as never,
      {} as never,
      {} as never,
      {} as never,
      { find: jest.fn(async () => found), update: jest.fn(async () => ({})) } as never,
      {} as never,
    {} as never, // consignmentRepo
      {} as never,
      {} as never,
     
     branchTransfersStub() as never,
  );
  }

  it('approves the batch the custodian actually reviewed', async () => {
    const result = await serviceWith([{ id: 's1' }, { id: 's2' }]).approveSales(
      ctxFor(CUSTODIAN, { asEmployee: true }),
      { saleIds: ['s1', 's2'], expectedCount: 2, reviewed: true },
    );
    expect(result).toEqual({ approved: 2 });
  });

  it('refuses when the queue grew since the screen was rendered', async () => {
    // The client listed 2 and is sending 3 ids: whatever it showed the person,
    // it was not this. Refusing is the whole value of `expectedCount` — an
    // "approve all" that silently swept in a line nobody saw would make the
    // attestation worthless.
    await expect(
      serviceWith([{ id: 's1' }, { id: 's2' }, { id: 's3' }]).approveSales(
        ctxFor(CUSTODIAN, { asEmployee: true }),
        { saleIds: ['s1', 's2', 's3'], expectedCount: 2, reviewed: true },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when a sale in the batch is no longer pending', async () => {
    await expect(
      serviceWith([{ id: 's1' }]).approveSales(ctxFor(CUSTODIAN, { asEmployee: true }), {
        saleIds: ['s1', 's2'],
        expectedCount: 2,
        reviewed: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
