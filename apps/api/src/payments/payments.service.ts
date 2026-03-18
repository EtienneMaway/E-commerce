import {
  BadRequestException,
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

  async paySupplier(ownerId: string, dto: PaySupplierDto): Promise<Payment> {
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

    // Create a PENDING payment — balances are only updated once the supplier approves.
    const payment = this.paymentRepo.create({
      amount: amount.toFixed(2),
      note: dto.note ?? null,
      direction: PaymentDirection.OWNER_TO_SUPPLIER,
      status: PaymentStatus.PENDING,
      remainingBalance: null,
      supplierDebtId: debt.id,
      paidByUserId: ownerId,
      paidToUserId: dto.supplierUserId,
    });
    return this.paymentRepo.save(payment);
  }

  // ─── Supplier: list pending payments sent to them by debtors ──────────────

  async getPendingFromDebtors(supplierId: string): Promise<Payment[]> {
    // Find SupplierDebt records where this user is the supplier,
    // then return all PENDING payments linked to those debts.
    // This covers both new payments (paidToUserId set) and old ones (paidToUserId null).
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
      .where('payment.supplier_debt_id IN (:...debtIds)', { debtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
      .orderBy('payment.created_at', 'DESC')
      .getMany();
  }

  // ─── Supplier: approve a pending payment ──────────────────────────────────

  async approvePayment(supplierId: string, paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      relations: { supplierDebt: true },
    });
    if (!payment) throw new NotFoundException('Pending payment not found');
    if (!payment.supplierDebt) throw new BadRequestException('Payment not linked to a debt record');

    // Verify the current user is the supplier being paid.
    // Use supplierDebt.supplierUserId rather than payment.paidToUserId because
    // old payments were created before paidToUserId was added (it can be null).
    if (payment.supplierDebt.supplierUserId !== supplierId) {
      throw new ForbiddenException('This payment is not addressed to you');
    }

    const amount = new Decimal(payment.amount);
    const debt = payment.supplierDebt;
    const debtorId = debt.ownerId;

    return this.dataSource.transaction(async (manager) => {
      // 1. Deduct from SupplierDebt (debtor's record)
      debt.totalPaid = new Decimal(debt.totalPaid).plus(amount).toFixed(2);
      debt.outstandingBalance = new Decimal(debt.outstandingBalance).minus(amount).toFixed(2);
      await manager.save(SupplierDebt, debt);

      // 2. Deduct from DebtorCredit (supplier's mirror record)
      const credit = await manager.findOne(DebtorCredit, {
        where: { ownerId: supplierId, debtorUserId: debtorId },
      });
      if (credit) {
        credit.totalReceived = new Decimal(credit.totalReceived).plus(amount).toFixed(2);
        credit.outstandingBalance = new Decimal(credit.outstandingBalance).minus(amount).toFixed(2);
        const savedCredit = await manager.save(DebtorCredit, credit);
        payment.debtorCreditId = savedCredit.id;
      }

      // 3. Approve the payment and record the resulting balance
      payment.status = PaymentStatus.APPROVED;
      payment.remainingBalance = debt.outstandingBalance;
      return manager.save(Payment, payment);
    });
  }

  // ─── Supplier: record a payment received directly from a debtor ───────────

  async recordDebtorPayment(
    ownerId: string,
    dto: RecordDebtorPaymentDto,
  ): Promise<Payment> {
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
      });
      return manager.save(Payment, payment);
    });
  }
}
