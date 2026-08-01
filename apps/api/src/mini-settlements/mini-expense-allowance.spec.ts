import { MiniSettlementsService } from './mini-settlements.service';
import { EmploymentTier, ExpenseCategory } from '../entities';
import type { ActorContext } from '../common/types/actor-context';

/**
 * A mini's expenses are capped at a share of what they have SOLD this cycle —
 * not of the value they were handed — so the ceiling grows as they sell.
 */
describe('MiniSettlementsService.expenseAllowance', () => {
  const MINI = 'mini-1';
  const OWNER = 'owner-1';

  const ctx: ActorContext = {
    actorId: MINI,
    effectiveOwnerId: MINI,
    tier: 'MINI_EMPLOYEE',
    employment: { employerId: OWNER } as never,
  };

  /**
   * @param pct        allowance the employer set (null = uncapped)
   * @param sales      rows on the mini's books since their last handover
   * @param pending    expenses already claimed on this cycle, FC
   */
  function build(
    pct: string,
    sales: { unitCost: string; qtySold: number; profit: string; usdToFcRateSnapshot: string }[],
    pending: { amount: string }[] = [],
  ) {
    const saleQb: Record<string, jest.Mock> = {
      where: jest.fn(() => saleQb),
      andWhere: jest.fn(() => saleQb),
      // computeSoldLines also reads salePrice (for the revenue column) — the
      // allowance only uses agreedValue, so any consistent figure will do.
      getMany: jest.fn(async () =>
        sales.map((s) => ({ productName: 'rice', salePrice: s.unitCost, ...s })),
      ),
    };
    const settlementRepo = { findOne: jest.fn(async () => null) };
    const employmentRepo = {
      findOne: jest.fn(async () => ({
        employerId: OWNER,
        employeeId: MINI,
        tier: EmploymentTier.SALES_ONLY,
        expenseAllowancePct: pct,
        employee: { id: MINI, username: 'mini', name: null, phone: null },
      })),
    };
    const miniExpenseRepo = {
      find: jest.fn(async () => pending),
      findOne: jest.fn(async () => null),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (v: unknown) => v),
    };
    // Outstanding debt gates expense recording at all — keep it positive.
    const supplierDebtRepo = {
      findOne: jest.fn(async () => ({ outstandingBalance: '500.0000' })),
    };
    const currencyService = {
      getRate: jest.fn(async () => ({ usdToFcRate: '2700', sellingRate: null })),
    };

    const service = new MiniSettlementsService(
      settlementRepo as never,
      {} as never, // itemRepo
      { find: jest.fn(async () => []) } as never, // entryRepo
      {} as never, // debtorCreditRepo
      supplierDebtRepo as never,
      { createQueryBuilder: jest.fn(() => saleQb) } as never,
      employmentRepo as never,
      miniExpenseRepo as never,
      {} as never, // dataSource
      {} as never, // stockMovements
      currencyService as never,
      {} as never, // variantRepo
      {} as never, // consignmentRepo
      {} as never, // miniTeamRepo
    );
    return { service, miniExpenseRepo };
  }

  // 100 USD of goods sold at a locked 2700 FC/USD = 270 000 FC.
  const SOLD_100_USD = [
    { unitCost: '10.0000', qtySold: 10, profit: '0.0000', usdToFcRateSnapshot: '2700' },
  ];

  it('caps the budget at the set percentage of what has been sold', async () => {
    const { service } = build('5', SOLD_100_USD);
    const allowance = await service.expenseAllowance(ctx);
    expect(allowance.soldFc).toBe('270000.0000');
    expect(allowance.allowanceFc).toBe('13500.0000'); // 5% of 270 000
    expect(allowance.remainingFc).toBe('13500.0000');
  });

  it('shrinks what is left by what has already been claimed', async () => {
    const { service } = build('5', SOLD_100_USD, [{ amount: '10000.0000' }]);
    const allowance = await service.expenseAllowance(ctx);
    expect(allowance.spentFc).toBe('10000.0000');
    expect(allowance.remainingFc).toBe('3500.0000');
  });

  it('leaves nothing to spend before anything is sold', async () => {
    const { service } = build('5', []);
    const allowance = await service.expenseAllowance(ctx);
    expect(allowance.allowanceFc).toBe('0.0000');
    expect(allowance.remainingFc).toBe('0.0000');
  });

  it('applies the 2% default when the employer has not changed it', async () => {
    const { service } = build('2.00', SOLD_100_USD);
    const allowance = await service.expenseAllowance(ctx);
    expect(allowance.pct).toBe('2.00');
    expect(allowance.allowanceFc).toBe('5400.0000'); // 2% of 270 000
    expect(allowance.remainingFc).toBe('5400.0000');
  });

  it('never goes negative once claims exceed the ceiling', async () => {
    const { service } = build('5', SOLD_100_USD, [{ amount: '20000.0000' }]);
    const allowance = await service.expenseAllowance(ctx);
    expect(allowance.remainingFc).toBe('0.0000');
  });

  it('rejects an expense that would break the ceiling, and allows one that fits', async () => {
    const { service, miniExpenseRepo } = build('5', SOLD_100_USD, [{ amount: '10000.0000' }]);
    // 3 500 FC left of the 13 500 budget.
    await expect(
      service.createExpense(ctx, { amount: '4000.0000', category: ExpenseCategory.TRANSPORT }),
    ).rejects.toThrow(/capped at 5% of what you have sold/i);
    expect(miniExpenseRepo.save).not.toHaveBeenCalled();

    await expect(
      service.createExpense(ctx, { amount: '3500.0000', category: ExpenseCategory.TRANSPORT }),
    ).resolves.toMatchObject({ amount: '3500.0000' });
  });

  it('lets an employer lift the ceiling by setting a high percentage', async () => {
    // There is no "no limit" any more — 100% means everything sold can go back
    // out as expenses, which is as unrestricted as the model allows.
    const { service } = build('100', SOLD_100_USD);
    await expect(
      service.createExpense(ctx, { amount: '270000.0000', category: ExpenseCategory.TRANSPORT }),
    ).resolves.toMatchObject({ amount: '270000.0000' });
    await expect(
      service.createExpense(ctx, { amount: '270001.0000', category: ExpenseCategory.TRANSPORT }),
    ).rejects.toThrow(/capped at 100%/i);
  });
});
