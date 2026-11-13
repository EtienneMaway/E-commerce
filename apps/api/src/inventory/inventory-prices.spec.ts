import { branchTransfersStub } from '../common/testing/branch-transfers.fixture';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { testCtx } from '../common/testing/actor-context.fixture';
import { InventoryService } from './inventory.service';
import { InventorySource } from '../entities';

const EMPLOYEE_CTX = testCtx({ tier: 'FULL_EMPLOYEE' });

/**
 * Coverage for editing the buying price (unit cost) and/or selling price on an
 * on-shelf lot: only PERSONAL/SUPPLIER lots on my own books are editable, an
 * empty body is rejected, and each field changes independently. Already-sold
 * quantities are unaffected because sale_transactions snapshot their own price.
 */
describe('InventoryService.updateEntryPrices', () => {
  const CTX = testCtx();

  function makeService(entry: unknown) {
    const entryRepo = {
      findOne: jest.fn(async () => entry),
      save: jest.fn(async (e: unknown) => e),
    };
    const service = new InventoryService(
      entryRepo as never, // entryRepo
      {} as never, // userRepo
      {} as never, // supplierDebtRepo
      {} as never, // debtorCreditRepo
      {} as never, // groupRepo
      {} as never, // variantRepo
      {} as never, // dataSource
      {} as never, // stockMovements
      {} as never, // shopContext
      branchTransfersStub() as never, // branchTransfers
    );
    return { service, entryRepo };
  }

  const shelfLot = () => ({
    id: 'e1',
    orgId: 'org-1',
    shopId: 'shop-1',
    ownerId: 'owner-1',
    source: InventorySource.PERSONAL,
    unitCost: '20.0000',
    sellingPrice: '30.0000',
  });

  it('updates both the buying price and selling price on a shelf lot', async () => {
    const { service, entryRepo } = makeService(shelfLot());
    const result = await service.updateEntryPrices(CTX, 'e1', {
      unitCost: '26',
      sellingPrice: '35',
    });
    expect(result.unitCost).toBe('26.0000');
    expect(result.sellingPrice).toBe('35.0000');
    expect(entryRepo.save).toHaveBeenCalledTimes(1);
  });

  it('updates only the field provided, leaving the other untouched', async () => {
    const { service } = makeService(shelfLot());
    const result = await service.updateEntryPrices(CTX, 'e1', { unitCost: '22' });
    expect(result.unitCost).toBe('22.0000');
    expect(result.sellingPrice).toBe('30.0000');
  });

  it('keeps an explicit carton buying price in sync with the per-piece cost', async () => {
    const { service } = makeService({
      ...shelfLot(),
      cartonPrice: '240.0000',
      piecesPerCarton: 12,
    });
    const result = await service.updateEntryPrices(CTX, 'e1', { unitCost: '25' });
    expect(result.unitCost).toBe('25.0000');
    expect(result.cartonPrice).toBe('300.0000');
  });

  it('leaves cartonPrice null when the lot has no carton buying price', async () => {
    const { service } = makeService({
      ...shelfLot(),
      cartonPrice: null,
      piecesPerCarton: 12,
    });
    const result = await service.updateEntryPrices(CTX, 'e1', { unitCost: '25' });
    expect(result.cartonPrice).toBeNull();
  });

  it('rejects an empty body', async () => {
    const { service } = makeService(shelfLot());
    await expect(service.updateEntryPrices(CTX, 'e1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects editing consigned-out stock', async () => {
    const { service } = makeService({
      ...shelfLot(),
      source: InventorySource.CONSIGNED_OUT,
    });
    await expect(
      service.updateEntryPrices(CTX, 'e1', { unitCost: '22' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows setting the resale selling price on consigned-in stock', async () => {
    const { service } = makeService({
      ...shelfLot(),
      source: InventorySource.CONSIGNED_IN,
    });
    const result = await service.updateEntryPrices(CTX, 'e1', {
      sellingPrice: '40',
    });
    expect(result.sellingPrice).toBe('40.0000');
  });

  it('rejects editing the buying price of consigned-in stock', async () => {
    const { service } = makeService({
      ...shelfLot(),
      source: InventorySource.CONSIGNED_IN,
    });
    await expect(
      service.updateEntryPrices(CTX, 'e1', { unitCost: '18' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids a non-owner from editing own-stock prices', async () => {
    const { service } = makeService(shelfLot());
    await expect(
      service.updateEntryPrices(EMPLOYEE_CTX, 'e1', { sellingPrice: '35' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a full employee set the resale price on consigned-in stock', async () => {
    const { service } = makeService({
      ...shelfLot(),
      source: InventorySource.CONSIGNED_IN,
    });
    const result = await service.updateEntryPrices(EMPLOYEE_CTX, 'e1', {
      sellingPrice: '40',
    });
    expect(result.sellingPrice).toBe('40.0000');
  });

  it('404s when the lot does not exist', async () => {
    const { service } = makeService(null);
    await expect(
      service.updateEntryPrices(CTX, 'missing', { unitCost: '22' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("forbids editing a lot on someone else's books", async () => {
    const { service } = makeService({ ...shelfLot(), ownerId: 'someone-else' });
    await expect(
      service.updateEntryPrices(CTX, 'e1', { unitCost: '22' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
