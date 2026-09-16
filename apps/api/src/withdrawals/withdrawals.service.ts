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
import { DashboardService } from '../dashboard/dashboard.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { holderCond, readScope, writeScope } from '../common/shop-scope';
import type { ActorContext } from '../common/types/actor-context';

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
    private readonly dashboardService: DashboardService,
  ) {}

  async getAvailable(ctx: ActorContext): Promise<AvailableWithdrawal> {
    const last = await this.getLastWithdrawal(ctx);
    const periodStartAt = last ? last.withdrawnAt : new Date(0);
    const leftoverCarried = last ? new Decimal(last.leftoverOut) : new Decimal(0);

    const [income, expenses] = await Promise.all([
      this.sumPeriodIncome(ctx, periodStartAt),
      this.sumPeriodExpensesUsd(ctx, periodStartAt),
    ]);

    const totalIncome = new Decimal(income.directSales)
      .plus(income.debtorPayments)
      .plus(income.externalPaymentIn);
    const available = totalIncome.minus(expenses).plus(leftoverCarried);

    return {
      lastWithdrawalAt: last?.withdrawnAt ?? null,
      periodStartAt,
      periodIncome: totalIncome.toFixed(4),
      periodExpenses: expenses.toFixed(4),
      leftoverCarried: leftoverCarried.toFixed(4),
      available: available.toFixed(4),
      incomeBreakdown: {
        directSales: income.directSales.toFixed(4),
        debtorPayments: income.debtorPayments.toFixed(4),
        externalPaymentIn: income.externalPaymentIn.toFixed(4),
      },
    };
  }

  async create(ctx: ActorContext, dto: CreateWithdrawalDto): Promise<Withdrawal> {
    const amountOriginal = new Decimal(dto.amount);
    if (amountOriginal.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    // Mental model: cash on hand is FC. Every withdrawal drains FC from the
    // till. For FC withdrawals the entered FC amount is what's drained. For
    // USD withdrawals the merchant exchanges FC for USD at the (less-
    // favourable) Current Market Rate, so the FC actually drained is
    // `amountUsd × buyingRate`. We persist amountUsd at the System Rate
    // value of FC drained — that keeps totalWithdrawn balanced against
    // totalCashReceived (also booked at the System Rate).
    const rateRow = await this.currencyService.getRate(ctx.orgId);
    const systemRate = rateRow?.usdToFcRate
      ? new Decimal(rateRow.usdToFcRate)
      : null;
    const buyingRate = rateRow?.sellingRate
      ? new Decimal(rateRow.sellingRate)
      : null;

    let amountUsd: Decimal;
    let rateSnapshot: string | null = null;
    if (dto.currency === WithdrawalCurrency.USD) {
      if (
        systemRate !== null && systemRate.gt(0) &&
        buyingRate !== null && buyingRate.gt(0)
      ) {
        // FC drained = amountOriginal × buyingRate.
        // Booked USD-at-system-rate value of that FC = (amountOriginal × buyingRate) / systemRate.
        amountUsd = amountOriginal.mul(buyingRate).div(systemRate);
        rateSnapshot = buyingRate.toFixed(4);
      } else {
        // No Current Market Rate configured — fall back to 1:1 with system rate (i.e.,
        // treat USD as USD with no spread).
        amountUsd = amountOriginal;
      }
    } else {
      if (!systemRate || systemRate.lte(0)) {
        throw new BadRequestException(
          'System rate not set — configure the USD → FC rate in Settings before recording FC withdrawals',
        );
      }
      rateSnapshot = systemRate.toFixed(4);
      amountUsd = amountOriginal.div(systemRate);
    }

    const [snapshot, position] = await Promise.all([
      this.getAvailable(ctx),
      this.dashboardService.getCashPosition(ctx),
    ]);
    const available = new Decimal(snapshot.available);
    const availableBusinessCash = new Decimal(position.availableBusinessCash);

    if (amountUsd.gt(availableBusinessCash)) {
      throw new BadRequestException(
        `Cannot withdraw more than available business cash (${availableBusinessCash.toFixed(4)} USD)`,
      );
    }

    const leftoverOut = Decimal.max(available.minus(amountUsd), new Decimal(0));

    const withdrawal = this.withdrawalRepo.create({
      ...writeScope(ctx),
      amount: amountOriginal.toFixed(4),
      currency: dto.currency,
      usdToFcRateSnapshot: rateSnapshot,
      amountUsd: amountUsd.toFixed(4),
      periodStartAt: snapshot.periodStartAt,
      periodIncome: snapshot.periodIncome,
      periodExpenses: snapshot.periodExpenses,
      leftoverCarried: snapshot.leftoverCarried,
      leftoverOut: leftoverOut.toFixed(4),
      note: dto.note ?? null,
    });
    return this.withdrawalRepo.save(withdrawal);
  }

  async list(
    ctx: ActorContext,
    page = 1,
    limit = 10,
  ): Promise<{
    data: Withdrawal[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const [data, total] = await this.withdrawalRepo.findAndCount({
      where: readScope(ctx),
      order: { withdrawnAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async remove(ctx: ActorContext, id: string): Promise<void> {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id, ...readScope(ctx) } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    const latest = await this.getLastWithdrawal(ctx);
    if (!latest || latest.id !== withdrawal.id) {
      throw new ForbiddenException(
        'Only the most recent withdrawal can be deleted (to preserve leftover carryover chain)',
      );
    }
    await this.withdrawalRepo.remove(withdrawal);
  }

  private async getLastWithdrawal(ctx: ActorContext): Promise<Withdrawal | null> {
    const [last] = await this.withdrawalRepo.find({
      where: readScope(ctx),
      order: { withdrawnAt: 'DESC' },
      take: 1,
    });
    return last ?? null;
  }

  private async sumPeriodIncome(
    ctx: ActorContext,
    since: Date,
  ): Promise<{ directSales: Decimal; debtorPayments: Decimal; externalPaymentIn: Decimal }> {
    const [salesAgg, paymentsAgg, externalAgg] = await Promise.all([
      this.saleRepo
        .createQueryBuilder('s')
        .select('COALESCE(SUM(CAST(s.salePrice AS DECIMAL) * s.qtySold), 0)', 'total')
        .where(...holderCond('s', ctx))
        .andWhere('s.rejected_at IS NULL')
        .andWhere('s.date > :since', { since })
        .getRawOne<{ total: string }>(),
      this.paymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(CAST(p.amount AS DECIMAL)), 0)', 'total')
        // Same reason as dashboard.getCashPosition: a payment belongs to two
        // businesses, and the receiving branch is the one holding the credit it
        // settles — not the payment's own shop_id, which records the payer.
        .innerJoin('debtor_credits', 'dc', 'dc.id = p.debtor_credit_id')
        .where('dc.org_id = :orgId', { orgId: ctx.orgId })
        .andWhere(ctx.shopId ? 'dc.shop_id = :shopId' : '1=1', { shopId: ctx.shopId })
        // tenancy-exempt: paidToUserId names the PERSON who received the cash.
        .andWhere('p.paidToUserId = :payee', { payee: ctx.effectiveOwnerId })
        .andWhere('p.direction = :dir', { dir: PaymentDirection.DEBTOR_TO_OWNER })
        .andWhere('p.status = :status', { status: PaymentStatus.APPROVED })
        .andWhere('p.date > :since', { since })
        .getRawOne<{ total: string }>(),
      this.externalTxRepo
        .createQueryBuilder('tx')
        .select('COALESCE(SUM(CAST(tx.amount AS DECIMAL)), 0)', 'total')
        .where('tx.orgId = :orgId', { orgId: ctx.orgId })
        .andWhere(ctx.shopId ? 'tx.shopId = :shopId' : '1=1', { shopId: ctx.shopId })
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

  private async sumPeriodExpensesUsd(ctx: ActorContext, since: Date): Promise<Decimal> {
    const expenses = await this.expenseRepo.find({
      where: { ...readScope(ctx), date: MoreThan(since) },
    });
    if (expenses.length === 0) return new Decimal(0);

    const currentRate = await this.currencyService.getRate(ctx.orgId);
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
