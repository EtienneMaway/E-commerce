import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository, FindOptionsWhere } from 'typeorm';
import Decimal from 'decimal.js';
import { Expense, ExpenseCategory, ExpenseCurrency } from '../entities';
import { CurrencyService } from '../currency/currency.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { ActorContext } from '../common/types/actor-context';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensePeriod, ListExpensesQueryDto } from './dto/list-expenses-query.dto';

export interface ExpenseListResult {
  data: Array<Expense & { amountUsd: string }>;
  totals: {
    totalAmountUsd: string;
    byCategory: Array<{ category: ExpenseCategory; totalUsd: string; count: number }>;
    count: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    private readonly currencyService: CurrencyService,
    private readonly dashboardService: DashboardService,
  ) {}

  async create(ctx: ActorContext, dto: CreateExpenseDto): Promise<Expense> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const amountOriginal = new Decimal(dto.amount);
    if (amountOriginal.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const requestedDate = dto.date ? new Date(dto.date) : new Date();
    if (requestedDate.getTime() > Date.now()) {
      throw new BadRequestException('Expense date cannot be in the future');
    }

    // Mental model: cash is FC. Every expense drains FC. For FC expenses the
    // entered amount is what's drained. For USD expenses the merchant must
    // exchange FC for USD at the Current Market Rate, so the FC actually drained is
    // `amountOriginal × buyingRate`. We persist amountUsd as the System-Rate
    // value of that FC, so totalExpenses balances against totalCashReceived
    // (also booked at the System Rate).
    const rateRow = await this.currencyService.getRate();
    const systemRate = rateRow?.usdToFcRate
      ? new Decimal(rateRow.usdToFcRate)
      : null;
    const buyingRate = rateRow?.sellingRate
      ? new Decimal(rateRow.sellingRate)
      : null;

    let rateSnapshot: string | null = null;
    let amountUsd = amountOriginal;
    if (dto.currency === ExpenseCurrency.FC) {
      if (!systemRate || systemRate.lte(0)) {
        throw new BadRequestException(
          'System rate not set — configure the USD → FC rate in Settings before recording FC expenses',
        );
      }
      rateSnapshot = systemRate.toFixed(4);
      amountUsd = amountOriginal.div(systemRate);
    } else {
      // USD expense — apply buying-rate spread when configured.
      if (
        systemRate !== null && systemRate.gt(0) &&
        buyingRate !== null && buyingRate.gt(0)
      ) {
        amountUsd = amountOriginal.mul(buyingRate).div(systemRate);
        rateSnapshot = buyingRate.toFixed(4);
      }
    }

    const position = await this.dashboardService.getCashPosition(ownerId);
    const availableProfit = new Decimal(position.availableProfitCash);
    const availableBusinessCash = new Decimal(position.availableBusinessCash);

    if (amountUsd.gt(availableProfit)) {
      throw new BadRequestException(
        `Cannot spend more than current profit — available profit is ${availableProfit.toFixed(4)} USD`,
      );
    }
    if (amountUsd.gt(availableBusinessCash)) {
      throw new BadRequestException(
        `Cannot spend more than available business cash (${availableBusinessCash.toFixed(4)} USD)`,
      );
    }

    const expense = this.expenseRepo.create({
      ownerId,
      actorId,
      amount: amountOriginal.toFixed(4),
      currency: dto.currency,
      category: dto.category,
      description: dto.description ?? null,
      usdToFcRateSnapshot: rateSnapshot,
      date: requestedDate,
    });
    return this.expenseRepo.save(expense);
  }

  async list(ctx: ActorContext, query: ListExpensesQueryDto): Promise<ExpenseListResult> {
    const ownerId = ctx.effectiveOwnerId;
    const where: FindOptionsWhere<Expense> = { ownerId };

    const range = this.resolveDateRange(query);
    if (range.from && range.to) {
      where.date = Between(range.from, range.to);
    } else if (range.from) {
      where.date = MoreThanOrEqual(range.from);
    } else if (range.to) {
      where.date = LessThanOrEqual(range.to);
    }
    if (query.category) where.category = query.category;
    if (query.actorId) where.actorId = query.actorId;

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    // Totals run against the full filter window — independent of the current page.
    const allMatching = await this.expenseRepo.find({
      where,
      order: { date: 'DESC' },
    });

    // Page slice loaded with the actor relation (UI shows actor name on rows).
    const pageRows = await this.expenseRepo.find({
      where,
      relations: { actor: true },
      order: { date: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Display USD value is computed at the Current Market Rate (lower rate). Cash is
    // held as FC, so the realistic USD value of any FC outflow is what the
    // merchant would receive when exchanging that FC for USD — i.e. divided by
    // the Current Market Rate. USD-entered expenses simply display as the typed USD.
    // Falls back to the captured system rate when no Current Market Rate is configured.
    const currentRate = await this.currencyService.getRate();
    const buyingRate = currentRate?.sellingRate
      ? new Decimal(currentRate.sellingRate)
      : null;
    const systemRate = currentRate?.usdToFcRate
      ? new Decimal(currentRate.usdToFcRate)
      : null;

    const data = pageRows.map((e) => ({
      ...e,
      amountUsd: this.toDisplayUsd(e, buyingRate, systemRate).toFixed(4),
    }));

    const categoryMap = new Map<ExpenseCategory, { total: Decimal; count: number }>();
    let grandTotal = new Decimal(0);
    for (const row of allMatching) {
      const usd = this.toDisplayUsd(row, buyingRate, systemRate);
      grandTotal = grandTotal.plus(usd);
      const stats = categoryMap.get(row.category) ?? { total: new Decimal(0), count: 0 };
      stats.total = stats.total.plus(usd);
      stats.count += 1;
      categoryMap.set(row.category, stats);
    }

    const total = allMatching.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data,
      totals: {
        totalAmountUsd: grandTotal.toFixed(4),
        byCategory: Array.from(categoryMap.entries())
          .map(([category, { total, count }]) => ({
            category,
            totalUsd: total.toFixed(4),
            count,
          }))
          .sort((a, b) => new Decimal(b.totalUsd).minus(a.totalUsd).toNumber()),
        count: total,
      },
      pagination: { page, limit, total, totalPages },
    };
  }

  async remove(ctx: ActorContext, id: string): Promise<void> {
    const ownerId = ctx.effectiveOwnerId;
    const expense = await this.expenseRepo.findOne({ where: { id, ownerId } });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.expenseRepo.remove(expense);
  }

  /**
   * USD value used for display on the expenses page. FC outflows convert at
   * the Current Market Rate (the rate the merchant would actually pay if
   * exchanging FC for USD). When no Current Market Rate is configured, fall back to
   * the row's snapshot rate, then to the current System Rate.
   */
  private toDisplayUsd(
    e: Expense,
    buyingRate: Decimal | null,
    systemRate: Decimal | null,
  ): Decimal {
    const amount = new Decimal(e.amount);
    if (e.currency === ExpenseCurrency.USD) return amount;
    const rate =
      buyingRate && buyingRate.gt(0)
        ? buyingRate
        : e.usdToFcRateSnapshot
        ? new Decimal(e.usdToFcRateSnapshot)
        : systemRate;
    if (!rate || rate.lte(0)) return new Decimal(0);
    return amount.div(rate);
  }

  private resolveDateRange(
    query: ListExpensesQueryDto,
  ): { from: Date | null; to: Date | null } {
    if (query.from || query.to) {
      return {
        from: query.from ? startOfDay(new Date(query.from)) : null,
        to: query.to ? endOfDay(new Date(query.to)) : null,
      };
    }
    const now = new Date();
    switch (query.period) {
      case ExpensePeriod.TODAY:
        return { from: startOfDay(now), to: endOfDay(now) };
      case ExpensePeriod.WEEK: {
        const d = startOfDay(now);
        const weekday = d.getDay(); // 0 = Sunday
        const mondayOffset = weekday === 0 ? 6 : weekday - 1;
        d.setDate(d.getDate() - mondayOffset);
        return { from: d, to: endOfDay(now) };
      }
      case ExpensePeriod.MONTH: {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: d, to: endOfDay(now) };
      }
      case ExpensePeriod.LAST_N_DAYS: {
        const days = query.days ?? 7;
        const d = startOfDay(now);
        d.setDate(d.getDate() - (days - 1));
        return { from: d, to: endOfDay(now) };
      }
      default:
        return { from: null, to: null };
    }
  }
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
