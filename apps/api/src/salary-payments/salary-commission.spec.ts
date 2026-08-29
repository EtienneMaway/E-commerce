import { SalaryPaymentsService } from './salary-payments.service';
import { SalaryPaymentKind, SalaryPaymentStatus } from '../entities';

/**
 * A mini employee's commission: a sealed percentage of each APPROVED
 * handover's sold value. Earned accrues from the first handover approved
 * after the rate was set (earlier ones carry a null pct and earn nothing),
 * and commission payments live beside — never inside — the monthly budget.
 */
describe('SalaryPaymentsService commission', () => {
  const EMPLOYER = 'owner-1';
  const MINI = 'mini-1';
  const EMPLOYMENT_ID = 'emp-1';

  function build({
    commissionPct = '10.00' as string | null,
    monthlyPay = null as string | null,
    settlements = [] as { cashAmount: string; commissionPct: string | null }[],
    payments = [] as { amount: string; kind: SalaryPaymentKind; status: SalaryPaymentStatus; periodMonth?: string }[],
  } = {}) {
    const employment = {
      id: EMPLOYMENT_ID,
      employerId: EMPLOYER,
      employeeId: MINI,
      status: 'ACTIVE',
      payrollActive: true,
      monthlyPay,
      commissionPct,
      employee: { id: MINI, isExternalEmployee: false },
    };
    const paymentRepo = {
      // The service always filters by kind — honour it so MONTHLY and
      // COMMISSION rows can never leak into each other's totals.
      find: jest.fn(async ({ where }: { where: { kind?: SalaryPaymentKind; periodMonth?: string } }) =>
        payments.filter(
          (p) =>
            (!where.kind || p.kind === where.kind) &&
            (!where.periodMonth || (p.periodMonth ?? '2026-08') === where.periodMonth),
        ),
      ),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (v: unknown) => v),
    };
    const employmentRepo = { findOne: jest.fn(async () => employment) };
    const settlementRepo = { find: jest.fn(async () => settlements) };

    const service = new SalaryPaymentsService(
      paymentRepo as never,
      employmentRepo as never,
      settlementRepo as never,
    );
    return { service, paymentRepo };
  }

  // Three handovers: one before the rate existed (null pct → earns nothing),
  // two sealed at different rates. Earned = 150×10% + 200×5% = 25.
  const SETTLEMENTS = [
    { cashAmount: '80.0000', commissionPct: null },
    { cashAmount: '150.0000', commissionPct: '10.00' },
    { cashAmount: '200.0000', commissionPct: '5.00' },
  ];

  it('earns each handover at its own sealed rate, skipping pre-rate handovers', async () => {
    const { service } = build({ settlements: SETTLEMENTS });
    const summary = await service.summary(EMPLOYER, { employmentId: EMPLOYMENT_ID });
    expect(summary.commission).not.toBeNull();
    expect(summary.commission?.earned).toBe('25.0000');
    expect(summary.commission?.remaining).toBe('25.0000');
  });

  it('shrinks what remains by confirmed commission payments only', async () => {
    const { service } = build({
      settlements: SETTLEMENTS,
      payments: [
        { amount: '10.0000', kind: SalaryPaymentKind.COMMISSION, status: SalaryPaymentStatus.CONFIRMED },
        { amount: '5.0000', kind: SalaryPaymentKind.COMMISSION, status: SalaryPaymentStatus.PENDING_CONFIRMATION },
        // A monthly payment must not touch the commission ledger.
        { amount: '100.0000', kind: SalaryPaymentKind.MONTHLY, status: SalaryPaymentStatus.CONFIRMED },
      ],
    });
    const summary = await service.summary(EMPLOYER, { employmentId: EMPLOYMENT_ID });
    expect(summary.commission?.paidConfirmed).toBe('10.0000');
    expect(summary.commission?.pendingConfirmation).toBe('5.0000');
    expect(summary.commission?.remaining).toBe('15.0000');
  });

  it('omits the commission block for employments where it was never in play', async () => {
    const { service } = build({ commissionPct: null, settlements: [], payments: [] });
    const summary = await service.summary(EMPLOYER, { employmentId: EMPLOYMENT_ID });
    expect(summary.commission).toBeNull();
  });

  it('keeps commission payments out of the monthly period totals', async () => {
    const { service } = build({
      monthlyPay: '100.0000',
      settlements: SETTLEMENTS,
      payments: [
        { amount: '60.0000', kind: SalaryPaymentKind.COMMISSION, status: SalaryPaymentStatus.CONFIRMED },
      ],
    });
    const summary = await service.summary(EMPLOYER, { employmentId: EMPLOYMENT_ID });
    // The $60 commission does not count toward the $100 monthly target.
    expect(summary.paidConfirmed).toBe('0.0000');
    expect(summary.balanceRemaining).toBe('100.0000');
  });

  it('refuses a commission payment when no commission percentage is set', async () => {
    const { service } = build({ commissionPct: null });
    await expect(
      service.create(EMPLOYER, {
        employmentId: EMPLOYMENT_ID,
        amount: 10,
        kind: SalaryPaymentKind.COMMISSION,
      }),
    ).rejects.toThrow(/commission percentage/i);
  });

  it('warns when a commission payment exceeds what was earned, and allows an override', async () => {
    const { service, paymentRepo } = build({
      settlements: SETTLEMENTS,
      payments: [
        { amount: '20.0000', kind: SalaryPaymentKind.COMMISSION, status: SalaryPaymentStatus.CONFIRMED },
      ],
    });
    // $25 earned, $20 already paid — $6 more overshoots.
    await expect(
      service.create(EMPLOYER, {
        employmentId: EMPLOYMENT_ID,
        amount: 6,
        kind: SalaryPaymentKind.COMMISSION,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMMISSION_OVERFLOW' }),
    });
    expect(paymentRepo.save).not.toHaveBeenCalled();

    await expect(
      service.create(EMPLOYER, {
        employmentId: EMPLOYMENT_ID,
        amount: 6,
        kind: SalaryPaymentKind.COMMISSION,
        confirmedOverride: true,
      }),
    ).resolves.toMatchObject({ kind: SalaryPaymentKind.COMMISSION, amount: '6.0000' });
  });

  it('records an exact-fit commission payment as pending confirmation for the mini', async () => {
    const { service } = build({ settlements: SETTLEMENTS });
    await expect(
      service.create(EMPLOYER, {
        employmentId: EMPLOYMENT_ID,
        amount: 25,
        kind: SalaryPaymentKind.COMMISSION,
      }),
    ).resolves.toMatchObject({
      kind: SalaryPaymentKind.COMMISSION,
      status: SalaryPaymentStatus.PENDING_CONFIRMATION,
    });
  });

  it('still requires a monthly pay for MONTHLY payments even when commission is set', async () => {
    const { service } = build({ commissionPct: '10.00', monthlyPay: null });
    await expect(
      service.create(EMPLOYER, { employmentId: EMPLOYMENT_ID, amount: 10 }),
    ).rejects.toThrow(/monthly pay/i);
  });
});
