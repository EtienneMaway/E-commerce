import { ConsignmentsService } from './consignments.service';
import { InventorySource } from '../entities';
import type { ActorContext } from '../common/types/actor-context';

const OWNER = 'owner-1';
const ownerCtx: ActorContext = {
  actorId: OWNER,
  effectiveOwnerId: OWNER,
  tier: 'OWNER',
  employment: null,
} as unknown as ActorContext;

/**
 * A sized consignment: the owner consigns 40 pieces of the "large" size of the
 * "casserole" group to a mini. create() must resolve the variant, derive the
 * product name from the group, and tag the ConsignmentItem with variantId/groupId
 * + the size's pieces-per-carton (not a name-based lookup).
 */
describe('ConsignmentsService.create — sized product', () => {
  function build() {
    const variant = { id: 'v-l', groupId: 'g1', sellingPrice: '6.0000', piecesPerCarton: 20 };
    const group = { id: 'g1', name: 'casserole' };
    const stockLot = {
      id: 'e-1',
      ownerId: OWNER,
      source: InventorySource.SUPPLIER,
      variantId: 'v-l',
      quantityRemaining: 100,
      unitCost: '4.0000',
      piecesPerCarton: 20,
    };

    let savedRequest: Record<string, unknown> | null = null;
    const requestRepo = {
      create: jest.fn((obj: Record<string, unknown>) => ({ ...obj })),
      save: jest.fn(async (obj: Record<string, unknown>) => {
        savedRequest = obj;
        return obj;
      }),
    };
    const itemRepo = { create: jest.fn((obj: Record<string, unknown>) => ({ ...obj })) };
    const userRepo = { findOne: jest.fn(async () => ({ id: 'debtor-1' })) };
    const entryRepo = { find: jest.fn(async () => [stockLot]) };
    const variantRepo = { findOne: jest.fn(async () => variant) };
    const groupRepo = { findOne: jest.fn(async () => group) };
    const pricingService = {
      applyEmployeePriceRule: jest.fn(async (args: { submittedUnitPrice: string }) => ({
        effectiveUnitPrice: args.submittedUnitPrice,
        standardPrice: variant.sellingPrice,
        capped: false,
        originalUnitPrice: null,
      })),
    };
    const currencyService = { getRate: jest.fn(async () => ({ usdToFcRate: '2700', sellingRate: null })) };

    const service = new ConsignmentsService(
      requestRepo as never,
      itemRepo as never,
      userRepo as never,
      entryRepo as never,
      {} as never, // debtorCreditRepo
      groupRepo as never,
      variantRepo as never,
      {} as never, // dataSource
      {} as never, // stockMovements
      pricingService as never,
      currencyService as never,
    );
    return { service, get savedRequest() { return savedRequest; }, pricingService };
  }

  it('tags the item with variantId/groupId, derives the group name, and uses the size pieces/carton', async () => {
    const h = build();
    await h.service.create(ownerCtx, {
      debtorUserId: 'debtor-1',
      items: [{ productName: 'ignored-by-variant', variantId: 'v-l', quantity: 40, agreedUnitPrice: '6.0000' }],
    } as never);

    const item = (h.savedRequest as { items: Record<string, unknown>[] }).items[0];
    expect(item.variantId).toBe('v-l');
    expect(item.groupId).toBe('g1');
    expect(item.productName).toBe('casserole'); // derived from the group, not dto
    expect(item.piecesPerCarton).toBe(20);
    expect(item.quantity).toBe(40);
    expect(item.agreedUnitPrice).toBe('6.0000');
    // Pricing enforced the size's standard price.
    expect(h.pricingService.applyEmployeePriceRule).toHaveBeenCalledWith(
      expect.objectContaining({ standardPrice: '6.0000', productName: 'casserole' }),
    );
  });

  it('rejects when the size does not exist', async () => {
    const h = build();
    (h.service as unknown as { variantRepo: { findOne: jest.Mock } }).variantRepo = {
      findOne: jest.fn(async () => null),
    };
    await expect(
      h.service.create(ownerCtx, {
        debtorUserId: 'debtor-1',
        items: [{ productName: 'x', variantId: 'missing', quantity: 1, agreedUnitPrice: '6.0000' }],
      } as never),
    ).rejects.toThrow();
  });
});
