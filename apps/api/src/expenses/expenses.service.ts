import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository, FindOptionsWhere } from 'typeorm';
import Decimal from 'decimal.js';
import { Expense, ExpenseCategory, ExpenseCurrency } from '../entities';
import { CurrencyService } from '../currency/currency.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensePeriod, ListExpensesQueryDto } from './dto/list-expenses-query.dto';

export interface ExpenseListResult {
  data: Array<Expense & { amountUsd: string }>;
  totals: {
    totalAmountUsd: string;
    byCategory: Array<{ category: ExpenseCategory; totalUsd: string; count: number }>;
    count: number;
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

  async create(ownerId: string, dto: CreateExpenseDto): Promise<Expense> {
    const amountOriginal = new Decimal(dto.amount);
    if (amountOriginal.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const requestedDate = dto.date ? new Date(dto.date) : new Date();
    if (requestedDate.getTime() > Date.now()) {
      throw new BadRequestException('Expense date cannot be in the future');
    }

    let rateSnapshot: string | null = null;
    let amountUsd = amountOriginal;
    if (dto.currency === ExpenseCurrency.FC) {
      const rate = await this.currencyService.getRate();
      if (!rate || new Decimal(rate.usdToFcRate).lte(0)) {
        throw new BadRequestException(
          'System rate not set — configure the USD → FC rate in Settings before recording FC expenses',
        );
      }
      rateSnapshot = new Decimal(rate.usdToFcRate).toFixed(4);
      amountUsd = amountOriginal.div(rate.usdToFcRate);
    }

    const position = await this.dashboardService.getCashPosition(ownerId);
    const availableProfit = new Decimal(position.availableProfitCash);
    const availableBusinessCash = new Decimal(position.availableBusinessCash);

    if (amountUsd.gt(availableProfit)) {
      throw new BadRequestException(
        `Cannot spend more than current profit — available profit is ${availableProfit.toFixed(2)} USD`,
      );
    }
    if (amountUsd.gt(availableBusinessCash)) {
      throw new BadRequestException(
        `Cannot spend more than available business cash (${availableBusinessCash.toFixed(2)} USD)`,
      );
    }

    const expense = this.expenseRepo.create({
      ownerId,
      amount: amountOriginal.toFixed(2),
      currency: dto.currency,
      category: dto.category,
      description: dto.description ?? null,
      usdToFcRateSnapshot: rateSnapshot,
      date: requestedDate,
    });
    return this.expenseRepo.save(expense);
  }

  async list(ownerId: string, query: ListExpensesQueryDto): Promise<ExpenseListResult> {
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

    const expenses = await this.expenseRepo.find({
      where,
      order: { date: 'DESC' },
    });

    // Fallback rate for FC rows missing a snapshot — uses System Rate.
    const currentRate = await this.currencyService.getRate();
    const fallbackRate = currentRate?.usdToFcRate
      ? new Decimal(currentRate.usdToFcRate)
      : null;

    const data = expenses.map((e) => ({
      ...e,
      amountUsd: this.toUsd(e, fallbackRate).toFixed(2),
    }));

    const categoryMap = new Map<ExpenseCategory, { total: Decimal; count: number }>();
    let grandTotal = new Decimal(0);
    for (const row of data) {
      const usd = new Decimal(row.amountUsd);
      grandTotal = grandTotal.plus(usd);
      const stats = categoryMap.get(row.category) ?? { total: new Decimal(0), count: 0 };
      stats.total = stats.total.plus(usd);
      stats.count += 1;
      categoryMap.set(row.category, stats);
    }

    return {
      data,
      totals: {
        totalAmountUsd: grandTotal.toFixed(2),
        byCategory: Array.from(categoryMap.entries())
          .map(([category, { total, count }]) => ({
            category,
            totalUsd: total.toFixed(2),
            count,
          }))
          .sort((a, b) => new Decimal(b.totalUsd).minus(a.totalUsd).toNumber()),
        count: data.length,
      },
    };
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const expense = await this.expenseRepo.findOne({ where: { id, ownerId } });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.expenseRepo.remove(expense);
  }

  private toUsd(e: Expense, fallbackRate: Decimal | null): Decimal {
    const amount = new Decimal(e.amount);
    if (e.currency === ExpenseCurrency.USD) return amount;
    const rate = e.usdToFcRateSnapshot
      ? new Decimal(e.usdToFcRateSnapshot)
      : fallbackRate;
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
