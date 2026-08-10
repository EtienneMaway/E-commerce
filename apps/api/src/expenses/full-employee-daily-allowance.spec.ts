import { ExpensesService } from './expenses.service';
import { ExpenseCategory, ExpenseCurrency } from '../entities';
import type { ActorContext } from '../common/types/actor-context';

/**
 * A full employee's expenses are capped per calendar day at a share of what
 * they personally sold that day — the ceiling grows with the day's sales and
 * resets the next day. Distinct from the mini-employee cycle allowance.
 */
describe('ExpensesService.dailyAllowance (full employee)', () => {
  const EMPLOYEE = 'employee-1';
  const OWNER = 'owner-1';

  const fullCtx = (pct: string): ActorContext => ({
    actorId: EMPLOYEE,
    effectiveOwnerId: OWNER,
    tier: 'FULL_EMPLOYEE',
    employment: { employerId: OWNER, expenseAllowancePct: pct } as never,
  });

  const ownerCtx: ActorContext = {
    actorId: OWNER,
    effectiveOwnerId: OWNER,
    tier: 'OWNER',
    employment: null,
  };

  /**
   * @param soldTodayUsd  Σ salePrice × qtySold of the employee's sales today
   * @param dayExpenses   expenses the employee already recorded today
   */
  function build(
    soldTodayUsd: string,
    dayExpenses: { amount: string; currency: ExpenseCurrency; usdToFcRateSnapshot?: string | null }[] = [],
  ) {
    const saleQb: Record<string, jest.Mock> = {
      select: jest.fn(() => saleQb),
      where: jest.fn(() => saleQb),
      andWhere: jest.fn(() => saleQb),
      getRawOne: jest.fn(async () => ({ revenue: soldTodayUsd })),
    };
    const expenseRepo = {
      find: jest.fn(async () => dayExpenses),
      findOne: jest.fn(async () => null),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (v: unknown) => v),
    };
    const currencyService = {
      getRate: jest.fn(async () => ({ usdToFcRate: '2700', sellingRate: null })),
    };
    // Global profit / business-cash caps stay out of the way — this spec is
    // about the per-employee daily ceiling only.
    const dashboardService = {
      getCashPosition: jest.fn(async () => ({
        availableProfitCash: '1000000.0000',
        availableBusinessCash: '1000000.0000',
      })),
    };

    const service = new ExpensesService(
      expenseRepo as never,
      currencyService as never,
      dashboardService as never,
      { createQueryBuilder: jest.fn(() => saleQb) } as never,
    );
    return { service, expenseRepo };
  }

  it('caps the day budget at the set percentage of what was sold that day', async () => {
    const { service } = build('100.0000');
    const allowance = await service.dailyAllowance(fullCtx('5'));
    expect(allowance.soldUsd).toBe('100.0000');
    expect(allowance.allowanceUsd).toBe('5.0000'); // 5% of $100
    expect(allowance.remainingUsd).toBe('5.0000');
  });

  it('shrinks what is left by what was already spent today, across currencies', async () => {
    const { service } = build('100.0000', [
      { amount: '1.0000', currency: ExpenseCurrency.USD },
      // 2 700 FC at the snapshotted 2 700 FC/USD system rate = $1.
      { amount: '2700.0000', currency: ExpenseCurrency.FC, usdToFcRateSnapshot: '2700' },
    ]);
    const allowance = await service.dailyAllowance(fullCtx('5'));
    expect(allowance.spentUsd).toBe('2.0000');
    expect(allowance.remainingUsd).toBe('3.0000');
  });

  it('leaves nothing to spend before anything is sold that day', async () => {
    const { service } = build('0');
    const allowance = await service.dailyAllowance(fullCtx('5'));
    expect(allowance.allowanceUsd).toBe('0.0000');
    expect(allowance.remainingUsd).toBe('0.0000');
  });

  it('applies the 2% default when the employer has not changed it', async () => {
    const { service } = build('100.0000');
    const allowance = await service.dailyAllowance(fullCtx('2.00'));
    expect(allowance.pct).toBe('2.00');
    expect(allowance.allowanceUsd).toBe('2.0000');
  });

  it('never goes negative once spending exceeds the ceiling', async () => {
    const { service } = build('100.0000', [
      { amount: '20.0000', currency: ExpenseCurrency.USD },
    ]);
    const allowance = await service.dailyAllowance(fullCtx('5'));
    expect(allowance.remainingUsd).toBe('0.0000');
  });

  it('rejects an expense that would break the ceiling, and allows one that fits', async () => {
    const { service, expenseRepo } = build('100.0000', [
      { amount: '2.0000', currency: ExpenseCurrency.USD },
    ]);
    // $3 left of the $5 budget.
    await expect(
      service.create(fullCtx('5'), {
        amount: '3.5000',
        currency: ExpenseCurrency.USD,
        category: ExpenseCategory.TRANSPORT,
      }),
    ).rejects.toThrow(/capped at 5% of what you sell/i);
    expect(expenseRepo.save).not.toHaveBeenCalled();

    await expect(
      service.create(fullCtx('5'), {
        amount: '3.0000',
        currency: ExpenseCurrency.USD,
        category: ExpenseCategory.TRANSPORT,
      }),
    ).resolves.toMatchObject({ amount: '3.0000' });
  });

  it('counts an FC expense at the System Rate when checking the ceiling', async () => {
    // $5 budget, nothing spent; 13 500 FC / 2 700 = exactly $5 → fits.
    const fits = build('100.0000');
    await expect(
      fits.service.create(fullCtx('5'), {
        amount: '13500.0000',
        currency: ExpenseCurrency.FC,
        category: ExpenseCategory.TRANSPORT,
      }),
    ).resolves.toMatchObject({ amount: '13500.0000' });

    const breaks = build('100.0000');
    await expect(
      breaks.service.create(fullCtx('5'), {
        amount: '13501.0000',
        currency: ExpenseCurrency.FC,
        category: ExpenseCategory.TRANSPORT,
      }),
    ).rejects.toThrow(/capped at 5%/i);
  });

  it('leaves the owner uncapped', async () => {
    const { service, expenseRepo } = build('0');
    await expect(
      service.create(ownerCtx, {
        amount: '500.0000',
        currency: ExpenseCurrency.USD,
        category: ExpenseCategory.TRANSPORT,
      }),
    ).resolves.toBeDefined();
    expect(expenseRepo.save).toHaveBeenCalled();
  });
});
