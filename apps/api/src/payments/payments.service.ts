import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  DebtorCredit,
  Payment,
  PaymentDirection,
  PaymentStatus,
  SupplierDebt,
} from '../entities';
import { ActorContext } from '../common/types/actor-context';
import { PaySupplierDto } from './dto/pay-supplier.dto';
import { RecordDebtorPaymentDto } from './dto/record-debtor-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(SupplierDebt)
    private readonly supplierDebtRepo: Repository<SupplierDebt>,
    @InjectRepository(DebtorCredit)
    private readonly debtorCreditRepo: Repository<DebtorCredit>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Debtor: submit a payment to a supplier (starts as PENDING) ────────────

  async paySupplier(ctx: ActorContext, dto: PaySupplierDto): Promise<Payment> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const debt = await this.supplierDebtRepo.findOne({
      where: { ownerId, supplierUserId: dto.supplierUserId },
    });
    if (!debt) {
      throw new NotFoundException(
        'No debt record found for this supplier. Receive stock first.',
      );
    }

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const existing = await this.paymentRepo.findOne({
      where: { supplierDebtId: debt.id, status: PaymentStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException(
        'You already have a pending payment for this supplier. Wait for it to be approved or rejected.',
      );
    }

    const payment = this.paymentRepo.create({
      amount: amount.toFixed(2),
      note: dto.note ?? null,
      direction: PaymentDirection.OWNER_TO_SUPPLIER,
      status: PaymentStatus.PENDING,
      remainingBalance: null,
      supplierDebtId: debt.id,
      paidByUserId: ownerId,
      paidToUserId: dto.supplierUserId,
      actorId,
    });
    return this.paymentRepo.save(payment);
  }

  // ─── Supplier: list pending payments sent to them by debtors ──────────────

  async getPendingFromDebtors(ctx: ActorContext): Promise<Payment[]> {
    const supplierId = ctx.effectiveOwnerId;
    const debts = await this.supplierDebtRepo.find({
      where: { supplierUserId: supplierId },
      select: ['id'],
    });
    if (debts.length === 0) return [];

    const debtIds = debts.map((d) => d.id);
    return this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.paidByUser', 'paidByUser')
      .leftJoinAndSelect('payment.supplierDebt', 'supplierDebt')
      .leftJoinAndSelect('payment.actor', 'actor')
      .where('payment.supplier_debt_id IN (:...debtIds)', { debtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
      .orderBy('payment.created_at', 'DESC')
      .getMany();
  }

  // ─── Supplier: approve a pending payment ──────────────────────────────────

  async approvePayment(ctx: ActorContext, paymentId: string): Promise<Payment> {
    const supplierId = ctx.effectiveOwnerId;
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      relations: { supplierDebt: true },
    });
    if (!payment) throw new NotFoundException('Pending payment not found');
    if (!payment.supplierDebt) throw new BadRequestException('Payment not linked to a debt record');

    if (payment.supplierDebt.supplierUserId !== supplierId) {
      throw new ForbiddenException('This payment is not addressed to you');
    }

    const amount = new Decimal(payment.amount);
    const debt = payment.supplierDebt;
    const debtorId = debt.ownerId;

    return this.dataSource.transaction(async (manager) => {
      debt.totalPaid = new Decimal(debt.totalPaid).plus(amount).toFixed(2);
      debt.outstandingBalance = new Decimal(debt.outstandingBalance).minus(amount).toFixed(2);
      await manager.save(SupplierDebt, debt);

      const credit = await manager.findOne(DebtorCredit, {
        where: { ownerId: supplierId, debtorUserId: debtorId },
      });
      if (credit) {
        credit.totalReceived = new Decimal(credit.totalReceived).plus(amount).toFixed(2);
        credit.outstandingBalance = new Decimal(credit.outstandingBalance).minus(amount).toFixed(2);
        const savedCredit = await manager.save(DebtorCredit, credit);
        payment.debtorCreditId = savedCredit.id;
      }

      payment.status = PaymentStatus.APPROVED;
      payment.remainingBalance = debt.outstandingBalance;
      return manager.save(Payment, payment);
    });
  }

  // ─── Supplier: reject a pending payment from a debtor ────────────────────

  async rejectPayment(ctx: ActorContext, paymentId: string): Promise<Payment> {
    const supplierId = ctx.effectiveOwnerId;
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      relations: { supplierDebt: true },
    });
    if (!payment) throw new NotFoundException('Pending payment not found');
    if (!payment.supplierDebt) throw new BadRequestException('Payment not linked to a debt record');

    if (payment.supplierDebt.supplierUserId !== supplierId) {
      throw new ForbiddenException('This payment is not addressed to you');
    }

    payment.status = PaymentStatus.REJECTED;
    return this.paymentRepo.save(payment);
  }

  // ─── Supplier: record a payment received directly from a debtor ───────────

  async recordDebtorPayment(
    ctx: ActorContext,
    dto: RecordDebtorPaymentDto,
  ): Promise<Payment> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const credit = await this.debtorCreditRepo.findOne({
      where: { ownerId, debtorUserId: dto.debtorUserId },
      relations: { debtorUser: true },
    });
    if (!credit) {
      throw new NotFoundException(
        'No credit record found for this debtor. Consign stock first.',
      );
    }

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    return this.dataSource.transaction(async (manager) => {
      credit.totalReceived = new Decimal(credit.totalReceived).plus(amount).toFixed(2);
      credit.outstandingBalance = new Decimal(credit.outstandingBalance)
        .minus(amount)
        .toFixed(2);
      await manager.save(DebtorCredit, credit);

      const payment = manager.create(Payment, {
        amount: amount.toFixed(2),
        note: dto.note ?? null,
        direction: PaymentDirection.DEBTOR_TO_OWNER,
        status: PaymentStatus.APPROVED,
        remainingBalance: credit.outstandingBalance,
        debtorCreditId: credit.id,
        paidByUserId: dto.debtorUserId,
        paidToUserId: ownerId,
        actorId,
      });
      return manager.save(Payment, payment);
    });
  }
}
