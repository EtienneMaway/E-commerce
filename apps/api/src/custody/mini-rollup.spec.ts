import { branchTransfersStub } from '../common/testing/branch-transfers.fixture';
import { CustodyHandoversService } from './custody-handovers.service';
import { CustodyService } from './custody.service';
import {
  ConsignmentStatus,
  InventoryEntry,
  InventorySource,
  MiniSettlementStatus,
  StockCustody,
  StockCustodyStatus,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';

/**
 * A mini hands their cash and unsold goods UP to the custodian who supplied
 * them, not past him to the owner (`SHOP_CUSTODY_PLAN.md` §3.6). The custodian
 * then owes both onward at his own handover — "+ money, + products".
 */

const ORG = 'org-1';
const SHOP = 'shop-1';
const OWNER = 'owner-1';
const CUSTODIAN = 'jean-1';
const MINI = 'mini-1';
const OPENED = new Date('2026-09-01T08:00:00.000Z');

const ctx = {
  actorId: CUSTODIAN,
  effectiveOwnerId: OWNER,
  tier: 'FULL_EMPLOYEE',
  services: new Set(),
  employment: { employerId: OWNER, shopId: SHOP },
  orgId: ORG,
  shopId: SHOP,
  visibleShopIds: [SHOP],
  shopScope: 'one',
  shopArchived: false,
} as unknown as ActorContext;

const custody = {
  id: 'custody-1',
  orgId: ORG,
  shopId: SHOP,
  custodianId: CUSTODIAN,
  status: StockCustodyStatus.OPEN,
  openedAt: OPENED,
} as StockCustody;

const settlement = (over: Record<string, unknown> = {}) => ({
  id: 'ms-1',
  miniId: MINI,
  mini: { id: MINI, name: 'Amina', username: 'amina' },
  status: MiniSettlementStatus.APPROVED,
  approvedAt: new Date('2026-09-05T12:00:00.000Z'),
  cashAmount: '30.0000',
  cashAmountFc: '81000.0000',
  items: [{ quantity: 3 }, { quantity: 2 }],
  ...over,
});

function build(opts: { consignments?: unknown[]; settlements?: unknown[] }) {
  const entry = {
    id: 'lot-1',
    source: InventorySource.SUPPLIER,
    productName: 'rice',
    unitCost: '25.0000',
    quantityRemaining: 10,
    variant: null,
  } as unknown as InventoryEntry;

  return new CustodyHandoversService(
    {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      create: jest.fn((d: unknown) => d),
      save: jest.fn(async (d: unknown) => d),
    } as never,
    {} as never,
    { findOne: jest.fn(async () => custody) } as never,
    { find: jest.fn(async () => [entry]), findOne: jest.fn(async () => entry) } as never,
    { find: jest.fn(async () => []) } as never, // no direct sales this period
    { find: jest.fn(async () => []) } as never, // no expenses
    { find: jest.fn(async () => opts.consignments ?? []) } as never,
    { find: jest.fn(async () => opts.settlements ?? []) } as never,
    {} as never,
    {} as never,
    { getRate: jest.fn(async () => ({ usdToFcRate: '2700.0000' })) } as never,
   
   branchTransfersStub() as never,
  );
}

const gaveToMini = [{ id: 'c1', debtorId: MINI, status: ConsignmentStatus.ACCEPTED }];

describe('a mini rolls up into the custodian who supplied them', () => {
  it("adds the mini's cash to what the custodian owes", async () => {
    const service = build({ consignments: gaveToMini, settlements: [settlement()] });
    const preview = await service.preview(ctx);

    expect(preview?.miniRollupCashFc).toBe('81000.0000');
    // No sales of his own this period, so what he owes IS the mini's cash.
    expect(preview?.cashExpectedFc).toBe('81000.0000');
    expect(preview?.miniRollupLines).toEqual([
      expect.objectContaining({ miniId: MINI, miniName: 'Amina', cashFc: '81000.0000' }),
    ]);
  });

  it('counts the units the mini handed back', async () => {
    const service = build({ consignments: gaveToMini, settlements: [settlement()] });
    const preview = await service.preview(ctx);
    expect(preview?.miniRollupLines[0].returnedUnits).toBe(5);
  });

  it("falls back to the sealing rate when a handover predates the FC snapshot", async () => {
    const service = build({
      consignments: gaveToMini,
      settlements: [settlement({ cashAmountFc: null })],
    });
    const preview = await service.preview(ctx);
    // 30 USD × 2700.
    expect(preview?.miniRollupCashFc).toBe('81000.0000');
  });
});

describe('what has not come back yet is reported, not charged', () => {
  it('shows a mini whose handover is still pending without taking their cash', async () => {
    // The stock left the custodian's volume and the money has not arrived. He
    // would otherwise look short at close through no fault of his own.
    const service = build({
      consignments: gaveToMini,
      settlements: [settlement({ status: MiniSettlementStatus.PENDING, approvedAt: null })],
    });
    const preview = await service.preview(ctx);

    expect(preview?.pendingMiniHandovers).toEqual([
      expect.objectContaining({ miniId: MINI, miniName: 'Amina' }),
    ]);
    expect(preview?.miniRollupCashFc).toBe('0.0000');
  });

  it('ignores a handover approved outside this period', async () => {
    const service = build({
      consignments: gaveToMini,
      settlements: [settlement({ approvedAt: new Date('2026-08-01T12:00:00.000Z') })],
    });
    const preview = await service.preview(ctx);
    expect(preview?.miniRollupCashFc).toBe('0.0000');
    expect(preview?.miniRollupLines).toHaveLength(0);
  });

  it('rolls up nothing when this custodian supplied no mini', async () => {
    // The backward-compatible case: minis supplied off the owner's own shelf
    // settle straight to him, exactly as they always have.
    const service = build({ consignments: [], settlements: [settlement()] });
    const preview = await service.preview(ctx);
    expect(preview?.miniRollupCashFc).toBe('0.0000');
    expect(preview?.pendingMiniHandovers).toHaveLength(0);
  });
});

describe('CustodyService.custodyForMini — where the goods came from', () => {
  function svc(request: unknown) {
    return new CustodyService(
      { findOne: jest.fn(async () => custody) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { findOne: jest.fn(async () => request) } as never,
      {} as never,
      {} as never,
     
     branchTransfersStub() as never,
    );
  }

  it('finds the custody that consigned to this mini', async () => {
    const found = await svc({ custodyId: 'custody-1' }).custodyForMini(MINI, ORG, SHOP);
    expect(found?.custodianId).toBe(CUSTODIAN);
  });

  it("returns null for a mini the owner supplied himself", async () => {
    // Every consignment before this feature. Their returns rejoin unassigned
    // stock, untouched by custody.
    const found = await svc(null).custodyForMini(MINI, ORG, SHOP);
    expect(found).toBeNull();
  });
});
