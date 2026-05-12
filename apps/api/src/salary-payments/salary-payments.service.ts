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
  SalaryPayment,
  SalaryPaymentStatus,
} from '../entities';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';
import { ListSalaryPaymentsDto, SalaryRoleFilter } from './dto/list-salary-payments.dto';
import { RejectSalaryPaymentDto } from './dto/reject-salary-payment.dto';
import { SalarySummaryQueryDto } from './dto/salary-summary-query.dto';

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
}

@Injectable()
export class SalaryPaymentsService {
  constructor(
    @InjectRepository(SalaryPayment)
    private readonly paymentRepo: Repository<SalaryPayment>,
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
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
    if (!employment.monthlyPay) {
      throw new BadRequestException('Set a monthly pay before recording a payment');
    }
    const isExternal = !!employment.employee?.isExternalEmployee;

    const periodMonth = dto.periodMonth ?? currentPeriodMonth();
    const amount = new Decimal(dto.amount);

    // Budget guard (warning, overridable): planned + new payment must not exceed monthly target.
    if (!dto.confirmedOverride) {
      const totals = await this.periodTotals(employment.id, periodMonth);
      const planned = totals.confirmed.plus(totals.pending);
      const projected = planned.plus(amount);
      const monthly = new Decimal(employment.monthlyPay);
      if (projected.gt(monthly)) {
        throw new UnprocessableEntityException({
          warning: true,
          code: 'SALARY_OVERFLOW',
          monthlyPay: monthly.toFixed(2),
          alreadyPlanned: planned.toFixed(2),
          attemptedAmount: amount.toFixed(2),
          projected: projected.toFixed(2),
          message: `This payment would put ${projected.toFixed(2)} USD against a ${monthly.toFixed(2)} USD monthly target — confirm to override.`,
        });
      }
    }

    const now = new Date();
    const payment = this.paymentRepo.create({
      employmentId: employment.id,
      employerId: employment.employerId,
      employeeId: employment.employeeId,
      amount: amount.toFixed(2),
      periodMonth,
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
      ? Decimal.max(new Decimal(monthlyPay).minus(totals.confirmed), new Decimal(0)).toFixed(2)
      : null;

    return {
      employmentId: employment.id,
      periodMonth,
      monthlyPay: monthlyPay ? new Decimal(monthlyPay).toFixed(2) : null,
      paidConfirmed: totals.confirmed.toFixed(2),
      pendingConfirmation: totals.pending.toFixed(2),
      rejected: totals.rejected.toFixed(2),
      balanceRemaining,
      paymentCount: totals.count,
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

  private async periodTotals(
    employmentId: string,
    periodMonth: string,
  ): Promise<{ confirmed: Decimal; pending: Decimal; rejected: Decimal; count: number }> {
    const rows = await this.paymentRepo.find({
      where: { employmentId, periodMonth },
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
