import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  Expense,
  ExpenseCurrency,
  ExternalTransaction,
  ExternalTransactionType,
  Payment,
  PaymentDirection,
  PaymentStatus,
  SaleTransaction,
  Withdrawal,
  WithdrawalCurrency,
} from '../entities';
import { CurrencyService } from '../currency/currency.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

export interface IncomeBreakdown {
  directSales: string;
  debtorPayments: string;
  externalPaymentIn: string;
}

export interface AvailableWithdrawal {
  lastWithdrawalAt: Date | null;
  periodStartAt: Date;
  periodIncome: string;        // USD
  periodExpenses: string;      // USD
  leftoverCarried: string;     // USD
  available: string;           // USD; periodIncome − periodExpenses + leftoverCarried
  incomeBreakdown: IncomeBreakdown;
}

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ExternalTransaction)
    private readonly externalTxRepo: Repository<ExternalTransaction>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    private readonly currencyService: CurrencyService,
  ) {}

  async getAvailable(ownerId: string): Promise<AvailableWithdrawal> {
    const last = await this.getLastWithdrawal(ownerId);
    const periodStartAt = last ? last.withdrawnAt : new Date(0);
    const leftoverCarried = last ? new Decimal(last.leftoverOut) : new Decimal(0);

    const [income, expenses] = await Promise.all([
      this.sumPeriodIncome(ownerId, periodStartAt),
      this.sumPeriodExpensesUsd(ownerId, periodStartAt),
    ]);

    const totalIncome = new Decimal(income.directSales)
      .plus(income.debtorPayments)
      .plus(income.externalPaymentIn);
    const available = totalIncome.minus(expenses).plus(leftoverCarried);

    return {
      lastWithdrawalAt: last?.withdrawnAt ?? null,
      periodStartAt,
      periodIncome: totalIncome.toFixed(2),
      periodExpenses: expenses.toFixed(2),
      leftoverCarried: leftoverCarried.toFixed(2),
      available: available.toFixed(2),
      incomeBreakdown: {
        directSales: income.directSales.toFixed(2),
        debtorPayments: income.debtorPayments.toFixed(2),
        externalPaymentIn: income.externalPaymentIn.toFixed(2),
      },
    };
  }

  async create(ownerId: string, dto: CreateWithdrawalDto): Promise<Withdrawal> {
    const amountOriginal = new Decimal(dto.amount);
    if (amountOriginal.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    // Convert to USD using the System Rate (usdToFcRate) — snapshot it.
    let amountUsd: Decimal;
    let rateSnapshot: string | null = null;
    if (dto.currency === WithdrawalCurrency.USD) {
      amountUsd = amountOriginal;
    } else {
      const rate = await this.currencyService.getRate();
      if (!rate || new Decimal(rate.usdToFcRate).lte(0)) {
        throw new BadRequestException(
          'System rate not set — configure the USD → FC rate in Settings before recording FC withdrawals',
        );
      }
      rateSnapshot = new Decimal(rate.usdToFcRate).toFixed(4);
      amountUsd = amountOriginal.div(rate.usdToFcRate);
    }

    const snapshot = await this.getAvailable(ownerId);
    const available = new Decimal(snapshot.available);

    if (amountUsd.gt(available)) {
      throw new BadRequestException(
        `Withdrawal exceeds available cash (${available.toFixed(2)} USD)`,
      );
    }

    const leftoverOut = available.minus(amountUsd);

    const withdrawal = this.withdrawalRepo.create({
      ownerId,
      amount: amountOriginal.toFixed(2),
      currency: dto.currency,
      usdToFcRateSnapshot: rateSnapshot,
      amountUsd: amountUsd.toFixed(2),
      periodStartAt: snapshot.periodStartAt,
      periodIncome: snapshot.periodIncome,
      periodExpenses: snapshot.periodExpenses,
      leftoverCarried: snapshot.leftoverCarried,
      leftoverOut: leftoverOut.toFixed(2),
      note: dto.note ?? null,
    });
    return this.withdrawalRepo.save(withdrawal);
  }

  async list(ownerId: string): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({
      where: { ownerId },
      order: { withdrawnAt: 'DESC' },
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id, ownerId } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    const latest = await this.getLastWithdrawal(ownerId);
    if (!latest || latest.id !== withdrawal.id) {
      throw new ForbiddenException(
        'Only the most recent withdrawal can be deleted (to preserve leftover carryover chain)',
      );
    }
    await this.withdrawalRepo.remove(withdrawal);
  }

  private async getLastWithdrawal(ownerId: string): Promise<Withdrawal | null> {
    const [last] = await this.withdrawalRepo.find({
      where: { ownerId },
      order: { withdrawnAt: 'DESC' },
      take: 1,
    });
    return last ?? null;
  }

  private async sumPeriodIncome(
    ownerId: string,
    since: Date,
  ): Promise<{ directSales: Decimal; debtorPayments: Decimal; externalPaymentIn: Decimal }> {
    const [salesAgg, paymentsAgg, externalAgg] = await Promise.all([
      this.saleRepo
        .createQueryBuilder('s')
        .select('COALESCE(SUM(CAST(s.salePrice AS DECIMAL) * s.qtySold), 0)', 'total')
        .where('s.ownerId = :ownerId', { ownerId })
        .andWhere('s.date > :since', { since })
        .getRawOne<{ total: string }>(),
      this.paymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(CAST(p.amount AS DECIMAL)), 0)', 'total')
        .where('p.paidToUserId = :ownerId', { ownerId })
        .andWhere('p.direction = :dir', { dir: PaymentDirection.DEBTOR_TO_OWNER })
        .andWhere('p.status = :status', { status: PaymentStatus.APPROVED })
        .andWhere('p.date > :since', { since })
        .getRawOne<{ total: string }>(),
      this.externalTxRepo
        .createQueryBuilder('tx')
        .select('COALESCE(SUM(CAST(tx.amount AS DECIMAL)), 0)', 'total')
        .where('tx.ownerId = :ownerId', { ownerId })
        .andWhere('tx.type = :type', { type: ExternalTransactionType.PAYMENT_IN })
        .andWhere('tx.createdAt > :since', { since })
        .getRawOne<{ total: string }>(),
    ]);

    return {
      directSales: new Decimal(salesAgg?.total ?? 0),
      debtorPayments: new Decimal(paymentsAgg?.total ?? 0),
      externalPaymentIn: new Decimal(externalAgg?.total ?? 0),
    };
  }

  private async sumPeriodExpensesUsd(ownerId: string, since: Date): Promise<Decimal> {
    const expenses = await this.expenseRepo.find({
      where: { ownerId, date: MoreThan(since) },
    });
    if (expenses.length === 0) return new Decimal(0);

    const currentRate = await this.currencyService.getRate();
    const fallbackRate = currentRate?.usdToFcRate
      ? new Decimal(currentRate.usdToFcRate)
      : null;

    let total = new Decimal(0);
    for (const e of expenses) {
      const amount = new Decimal(e.amount);
      if (e.currency === ExpenseCurrency.USD) {
        total = total.plus(amount);
        continue;
      }
      const rate = e.usdToFcRateSnapshot
        ? new Decimal(e.usdToFcRateSnapshot)
        : fallbackRate;
      if (!rate || rate.lte(0)) continue;
      total = total.plus(amount.div(rate));
    }
    return total;
  }
}
