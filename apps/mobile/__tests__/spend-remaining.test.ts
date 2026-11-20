import { computeSpendRemaining } from '../lib/spend-remaining';

describe('computeSpendRemaining', () => {
  const rates = { systemRate: 2400, marketRate: 2500 };

  it('owner: profit in the till in FC, and in USD bought at the market rate', () => {
    // $82.8978 ledger → 198,954 FC; buys 198,954 / 2500 = $79.58.
    const r = computeSpendRemaining({
      profitLedgerUsd: '82.8978',
      dailyAllowanceUsd: null,
      miniAllowanceFc: null,
      ...rates,
    });
    expect(r).toEqual({ fc: 198954, usd: 79.58, limitedBy: 'business' });
  });

  it('falls back to the System Rate when no market rate is set', () => {
    const r = computeSpendRemaining({
      profitLedgerUsd: '10',
      dailyAllowanceUsd: null,
      miniAllowanceFc: null,
      systemRate: 2400,
      marketRate: null,
    });
    expect(r).toEqual({ fc: 24000, usd: 10, limitedBy: 'business' });
  });

  it('never shows a negative figure', () => {
    const r = computeSpendRemaining({
      profitLedgerUsd: '-5278.4343',
      dailyAllowanceUsd: null,
      miniAllowanceFc: null,
      ...rates,
    });
    expect(r).toEqual({ fc: 0, usd: 0, limitedBy: 'business' });
  });

  it('full employee: the smaller of the daily allowance and the business limit', () => {
    const r = computeSpendRemaining({
      profitLedgerUsd: '100',
      dailyAllowanceUsd: '3',
      miniAllowanceFc: null,
      ...rates,
    });
    expect(r).toEqual({ fc: 7200, usd: 3, limitedBy: 'daily' });
  });

  it('takes queued offline expenses off both limits', () => {
    const r = computeSpendRemaining({
      profitLedgerUsd: '10',
      dailyAllowanceUsd: null,
      miniAllowanceFc: null,
      ...rates,
      // 4,800 FC = $2 ledger; $1 USD = 2500/2400 ledger.
      queued: [{ amount: '4800', currency: 'FC' }, { amount: '1', currency: 'USD' }],
    });
    // 10 − 2 − 1.041666… = 6.958333… ledger → 16,700 FC → $6.68.
    expect(r).toEqual({ fc: 16700, usd: 6.68, limitedBy: 'business' });
  });

  it('mini: FC allowance, USD for reference at the System Rate', () => {
    const r = computeSpendRemaining({
      profitLedgerUsd: null,
      dailyAllowanceUsd: null,
      miniAllowanceFc: '12000',
      ...rates,
    });
    expect(r).toEqual({ fc: 12000, usd: 5, limitedBy: 'mini' });
  });

  it('returns null when no limit is visible', () => {
    expect(
      computeSpendRemaining({
        profitLedgerUsd: null,
        dailyAllowanceUsd: null,
        miniAllowanceFc: null,
        ...rates,
      }),
    ).toBeNull();
  });
});
