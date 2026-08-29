import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  Employment,
  EmploymentStatus,
  MiniSettlement,
  MiniSettlementStatus,
  SalaryPayment,
  SalaryPaymentKind,
  SalaryPaymentStatus,
} from '../entities';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';
import { ListSalaryPaymentsDto, SalaryRoleFilter } from './dto/list-salary-payments.dto';
import { RejectSalaryPaymentDto } from './dto/reject-salary-payment.dto';
import { SalarySummaryQueryDto } from './dto/salary-summary-query.dto';

export interface CommissionSummary {
  /** The employment's current rate — what future handovers will seal. */
  pct: string | null;
  /** Σ cashAmount × sealed pct over APPROVED handovers (all-time; only handovers approved while a rate was set). */
  earned: string;
  paidConfirmed: string;
  pendingConfirmation: string;
  /** earned − paidConfirmed (clamped to ≥0). */
  remaining: string;
}

export interface SalarySummary {
  employmentId: string;
  periodMonth: string;
  monthlyPay: string | null;
  paidConfirmed: string;
  pendingConfirmation: string;
  rejected: string;
  /** monthlyPay - paidConfirmed (clamped to ≥0). null when monthlyPay is unset. */
  balanceRemaining: string | null;
  paymentCount: number;
  /**
   * Mini-employee handover commission. Null when the employment has no
   * commission set and none was ever paid — the UI hides the whole block.
   */
  commission: CommissionSummary | null;
}

@Injectable()
export class SalaryPaymentsService {
  constructor(
    @InjectRepository(SalaryPayment)
    private readonly paymentRepo: Repository<SalaryPayment>,
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
    @InjectRepository(MiniSettlement)
    private readonly settlementRepo: Repository<MiniSettlement>,
  ) {}

  // ─── Employer: record a new payment (PENDING_CONFIRMATION) ───────────────

  async create(actorId: string, dto: CreateSalaryPaymentDto): Promise<SalaryPayment> {
    const employment = await this.employmentRepo.findOne({
      where: { id: dto.employmentId },
      relations: { employee: true },
    });
    if (!employment) throw new NotFoundException('Employment not found');
    if (employment.employerId !== actorId) {
      throw new ForbiddenException('Only the employer can record a salary payment');
    }
    if (employment.status !== EmploymentStatus.ACTIVE && employment.status !== EmploymentStatus.TERMINATION_REQUESTED) {
      throw new BadRequestException('Employment is not active');
    }
    if (!employment.payrollActive) {
      throw new BadRequestException('Payroll is paused for this employee — reactivate before recording a payment');
    }
    const kind = dto.kind ?? SalaryPaymentKind.MONTHLY;
    if (kind === SalaryPaymentKind.MONTHLY && !employment.monthlyPay) {
      throw new BadRequestException('Set a monthly pay before recording a payment');
    }
    if (kind === SalaryPaymentKind.COMMISSION && !employment.commissionPct) {
      throw new BadRequestException('Set a commission percentage before recording a commission payment');
    }
    const isExternal = !!employment.employee?.isExternalEmployee;

    const periodMonth = dto.periodMonth ?? currentPeriodMonth();
    const amount = new Decimal(dto.amount);

    // Budget guards (warning, overridable): planned + new payment must not
    // exceed the target — the monthly pay for MONTHLY, what the mini's
    // approved handovers have earned so far for COMMISSION.
    if (!dto.confirmedOverride && kind === SalaryPaymentKind.MONTHLY) {
      const totals = await this.periodTotals(employment.id, periodMonth);
      const planned = totals.confirmed.plus(totals.pending);
      const projected = planned.plus(amount);
      const monthly = new Decimal(employment.monthlyPay as string);
      if (projected.gt(monthly)) {
        throw new UnprocessableEntityException({
          warning: true,
          code: 'SALARY_OVERFLOW',
          monthlyPay: monthly.toFixed(4),
          alreadyPlanned: planned.toFixed(4),
          attemptedAmount: amount.toFixed(4),
          projected: projected.toFixed(4),
          message: `This payment would put ${projected.toFixed(4)} USD against a ${monthly.toFixed(4)} USD monthly target — confirm to override.`,
        });
      }
    }
    if (!dto.confirmedOverride && kind === SalaryPaymentKind.COMMISSION) {
      const totals = await this.commissionTotals(employment);
      const planned = totals.confirmed.plus(totals.pending);
      const projected = planned.plus(amount);
      if (projected.gt(totals.earned)) {
        throw new UnprocessableEntityException({
          warning: true,
          code: 'COMMISSION_OVERFLOW',
          commissionEarned: totals.earned.toFixed(4),
          alreadyPlanned: planned.toFixed(4),
          attemptedAmount: amount.toFixed(4),
          projected: projected.toFixed(4),
          message: `This payment would put ${projected.toFixed(4)} USD against ${totals.earned.toFixed(4)} USD of commission earned so far — confirm to override.`,
        });
      }
    }

    const now = new Date();
    const payment = this.paymentRepo.create({
      employmentId: employment.id,
      employerId: employment.employerId,
      employeeId: employment.employeeId,
      amount: amount.toFixed(4),
      periodMonth,
      kind,
      // External employees can't log in to confirm — payment is settled immediately.
      status: isExternal ? SalaryPaymentStatus.CONFIRMED : SalaryPaymentStatus.PENDING_CONFIRMATION,
      note: dto.note ?? null,
      paidAt: now,
      confirmedAt: isExternal ? now : null,
    });
    return this.paymentRepo.save(payment);
  }

  // ─── List (employer or employee perspective) ─────────────────────────────

  async list(actorId: string, filter: ListSalaryPaymentsDto): Promise<SalaryPayment[]> {
    const role = filter.role ?? SalaryRoleFilter.EMPLOYER;
    const qb = this.paymentRepo
      .createQueryBuilder('sp')
      .leftJoinAndSelect('sp.employer', 'employer')
      .leftJoinAndSelect('sp.employee', 'employee')
      .leftJoinAndSelect('sp.employment', 'employment')
      .orderBy('sp.paidAt', 'DESC');

    if (role === SalaryRoleFilter.EMPLOYER) {
      qb.where('sp.employerId = :actorId', { actorId });
    } else {
      qb.where('sp.employeeId = :actorId', { actorId });
    }

    if (filter.employmentId) {
      qb.andWhere('sp.employmentId = :employmentId', { employmentId: filter.employmentId });
    }
    if (filter.status) {
      qb.andWhere('sp.status = :status', { status: filter.status });
    }
    if (filter.periodMonth) {
      qb.andWhere('sp.periodMonth = :periodMonth', { periodMonth: filter.periodMonth });
    }

    return qb.getMany();
  }

  /** Pending confirmations from the employee's perspective. */
  async pendingForEmployee(actorId: string): Promise<SalaryPayment[]> {
    return this.paymentRepo.find({
      where: { employeeId: actorId, status: SalaryPaymentStatus.PENDING_CONFIRMATION },
      relations: { employer: true, employment: true },
      order: { paidAt: 'DESC' },
    });
  }

  // ─── Summary for one employment + period ─────────────────────────────────

  async summary(actorId: string, query: SalarySummaryQueryDto): Promise<SalarySummary> {
    const employment = await this.employmentRepo.findOne({ where: { id: query.employmentId } });
    if (!employment) throw new NotFoundException('Employment not found');
    if (employment.employerId !== actorId && employment.employeeId !== actorId) {
      throw new ForbiddenException('You are not part of this employment');
    }

    const periodMonth = query.periodMonth ?? currentPeriodMonth();
    const totals = await this.periodTotals(employment.id, periodMonth);

    const monthlyPay = employment.monthlyPay;
    const balanceRemaining = monthlyPay
      ? Decimal.max(new Decimal(monthlyPay).minus(totals.confirmed), new Decimal(0)).toFixed(4)
      : null;

    // Commission block: only for employments where it is (or was) in play, so
    // regular full-employee summaries stay unchanged.
    let commission: CommissionSummary | null = null;
    const commissionTotals = await this.commissionTotals(employment);
    if (employment.commissionPct || commissionTotals.earned.gt(0) || commissionTotals.count > 0) {
      commission = {
        pct: employment.commissionPct ? new Decimal(employment.commissionPct).toFixed(2) : null,
        earned: commissionTotals.earned.toFixed(4),
        paidConfirmed: commissionTotals.confirmed.toFixed(4),
        pendingConfirmation: commissionTotals.pending.toFixed(4),
        remaining: Decimal.max(
          commissionTotals.earned.minus(commissionTotals.confirmed),
          new Decimal(0),
        ).toFixed(4),
      };
    }

    return {
      employmentId: employment.id,
      periodMonth,
      monthlyPay: monthlyPay ? new Decimal(monthlyPay).toFixed(4) : null,
      paidConfirmed: totals.confirmed.toFixed(4),
      pendingConfirmation: totals.pending.toFixed(4),
      rejected: totals.rejected.toFixed(4),
      balanceRemaining,
      paymentCount: totals.count,
      commission,
    };
  }

  // ─── State transitions ───────────────────────────────────────────────────

  async confirm(actorId: string, id: string): Promise<SalaryPayment> {
    const payment = await this.findById(id);
    if (payment.employeeId !== actorId) {
      throw new ForbiddenException('Only the employee can confirm this payment');
    }
    if (payment.status !== SalaryPaymentStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Payment is not pending confirmation');
    }
    payment.status = SalaryPaymentStatus.CONFIRMED;
    payment.confirmedAt = new Date();
    return this.paymentRepo.save(payment);
  }

  async reject(actorId: string, id: string, dto: RejectSalaryPaymentDto): Promise<SalaryPayment> {
    const payment = await this.findById(id);
    if (payment.employeeId !== actorId) {
      throw new ForbiddenException('Only the employee can reject this payment');
    }
    if (payment.status !== SalaryPaymentStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Payment is not pending confirmation');
    }
    payment.status = SalaryPaymentStatus.REJECTED;
    payment.rejectedAt = new Date();
    payment.rejectionReason = dto.reason ?? null;
    return this.paymentRepo.save(payment);
  }

  async cancel(actorId: string, id: string): Promise<SalaryPayment> {
    const payment = await this.findById(id);
    if (payment.employerId !== actorId) {
      throw new ForbiddenException('Only the employer can cancel this payment');
    }
    if (payment.status !== SalaryPaymentStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Only pending payments can be cancelled');
    }
    payment.status = SalaryPaymentStatus.CANCELLED;
    payment.cancelledAt = new Date();
    return this.paymentRepo.save(payment);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async findById(id: string): Promise<SalaryPayment> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: { employer: true, employee: true, employment: true },
    });
    if (!payment) throw new NotFoundException('Salary payment not found');
    return payment;
  }

  /**
   * What a mini's approved handovers have earned them in commission, against
   * what has been paid for it. Earned = Σ cashAmount × the pct SEALED on each
   * handover (all-time; handovers approved before a rate was set carry null
   * and earn nothing). Payments are the employment's COMMISSION-kind rows —
   * they don't touch the monthly budget and the monthly rows don't touch this.
   */
  private async commissionTotals(
    employment: Employment,
  ): Promise<{ earned: Decimal; confirmed: Decimal; pending: Decimal; count: number }> {
    const settlements = await this.settlementRepo.find({
      where: {
        ownerId: employment.employerId,
        miniId: employment.employeeId,
        status: MiniSettlementStatus.APPROVED,
      },
    });
    let earned = new Decimal(0);
    for (const s of settlements) {
      if (!s.commissionPct) continue;
      earned = earned.plus(
        new Decimal(s.cashAmount).mul(new Decimal(s.commissionPct)).div(100),
      );
    }

    const rows = await this.paymentRepo.find({
      where: { employmentId: employment.id, kind: SalaryPaymentKind.COMMISSION },
    });
    let confirmed = new Decimal(0);
    let pending = new Decimal(0);
    for (const row of rows) {
      const amt = new Decimal(row.amount);
      if (row.status === SalaryPaymentStatus.CONFIRMED) confirmed = confirmed.plus(amt);
      else if (row.status === SalaryPaymentStatus.PENDING_CONFIRMATION) pending = pending.plus(amt);
    }
    return { earned, confirmed, pending, count: rows.length };
  }

  private async periodTotals(
    employmentId: string,
    periodMonth: string,
  ): Promise<{ confirmed: Decimal; pending: Decimal; rejected: Decimal; count: number }> {
    // Only MONTHLY rows: commission payments have their own budget and must
    // not consume the month's salary target.
    const rows = await this.paymentRepo.find({
      where: { employmentId, periodMonth, kind: SalaryPaymentKind.MONTHLY },
    });
    let confirmed = new Decimal(0);
    let pending = new Decimal(0);
    let rejected = new Decimal(0);
    for (const row of rows) {
      const amt = new Decimal(row.amount);
      if (row.status === SalaryPaymentStatus.CONFIRMED) confirmed = confirmed.plus(amt);
      else if (row.status === SalaryPaymentStatus.PENDING_CONFIRMATION) pending = pending.plus(amt);
      else if (row.status === SalaryPaymentStatus.REJECTED) rejected = rejected.plus(amt);
    }
    return { confirmed, pending, rejected, count: rows.length };
  }
}

function currentPeriodMonth(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}
