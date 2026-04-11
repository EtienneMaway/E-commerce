import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  InventoryEntry,
  InventorySource,
  SaleTransaction,
  StockMovementReason,
} from '../entities';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { RecordSaleDto } from './dto/record-sale.dto';
import {
  SalesFilterDto,
  SalesHistoryPeriod,
  SalesPeriod,
  TopProductsFilterDto,
  TopProductsRankBy,
} from './dto/sales-filter.dto';
import { PriceGuardWarningDto } from './dto/price-guard-warning.dto';

export interface TopProduct {
  productName: string;
  totalQtySold: number;
  totalRevenue: string;
  totalProfit: string;
  isLossProduct: boolean;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
  ) {}

  // PriceGuardWarningDto is thrown as an UnprocessableEntityException (HTTP 422),
  // never returned — so the return type is always SaleTransaction on success.
  async recordSale(
    ownerId: string,
    dto: RecordSaleDto,
  ): Promise<SaleTransaction> {
    // Find available stock: SUPPLIER first, then CONSIGNED_IN, then PERSONAL
    const productNamePattern = ILike(dto.productName.trim().toLowerCase());

    const [supplierEntries, consignedInEntries, personalEntries] = await Promise.all([
      this.entryRepo.find({
        where: { ownerId, productName: productNamePattern, source: InventorySource.SUPPLIER },
        order: { createdAt: 'ASC' },
      }),
      this.entryRepo.find({
        where: { ownerId, productName: productNamePattern, source: InventorySource.CONSIGNED_IN },
        order: { createdAt: 'ASC' },
      }),
      this.entryRepo.find({
        where: { ownerId, productName: productNamePattern, source: InventorySource.PERSONAL },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const allEntries = [...supplierEntries, ...consignedInEntries, ...personalEntries].filter(
      (e) => e.quantityRemaining > 0,
    );

    if (allEntries.length === 0) {
      throw new BadRequestException(
        `No stock found for product "${dto.productName}"`,
      );
    }

    const totalAvailable = allEntries.reduce(
      (sum, e) => sum + e.quantityRemaining,
      0,
    );
    if (totalAvailable < dto.qtySold) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${totalAvailable}, requested: ${dto.qtySold}`,
      );
    }

    // Price guard check — use the unit cost of the first entry (supplier stock if any)
    const firstEntry = allEntries[0];
    const salePrice = new Decimal(dto.salePrice);
    const unitCost = new Decimal(firstEntry.unitCost);

    if (salePrice.lte(unitCost) && !dto.confirmedOverride) {
      // potentialLoss is a positive number representing total money lost
      const potentialLoss = unitCost.minus(salePrice).mul(dto.qtySold).toFixed(2);
      const warning: PriceGuardWarningDto = {
        warning: true,
        costPrice: unitCost.toFixed(2),
        potentialLoss,
        message:
          `Selling at ${salePrice.toFixed(2)} is at or below cost price of ${unitCost.toFixed(2)}. ` +
          `You will lose ${potentialLoss} total. ` +
          `Send confirmedOverride: true to proceed.`,
      };
      throw new UnprocessableEntityException(warning);
    }

    return this.dataSource.transaction(async (manager) => {
      const sales: SaleTransaction[] = [];
      let remaining = dto.qtySold;

      for (const entry of allEntries) {
        if (remaining === 0) break;

        const deduct = Math.min(entry.quantityRemaining, remaining);
        const entryCost = new Decimal(entry.unitCost);
        const entryProfit = salePrice.minus(entryCost).mul(deduct);
        const qtyBeforeDeduct = entry.quantityRemaining;

        entry.quantityRemaining -= deduct;
        remaining -= deduct;
        await manager.save(InventoryEntry, entry);

        const sale = manager.create(SaleTransaction, {
          ownerId,
          productName: entry.productName,
          source: entry.source,
          supplierUserId: entry.supplierUserId,
          qtySold: deduct,
          unitCost: entryCost.toFixed(2),
          salePrice: salePrice.toFixed(2),
          profit: entryProfit.toFixed(2),
          isLoss: entryProfit.lt(0),
          inventoryEntryId: entry.id,
        });
        const savedSale = await manager.save(SaleTransaction, sale);
        sales.push(savedSale);

        await this.stockMovements.record(manager, {
          ownerId,
          entry,
          reason: StockMovementReason.SALE,
          qty: deduct,
          qtyBefore: qtyBeforeDeduct,
          saleTransactionId: savedSale.id,
        });
      }

      // Return the primary sale record (first entry deducted)
      return sales[0];
    });
  }

  async findAll(
    ownerId: string,
    filter: SalesFilterDto,
  ): Promise<{ data: SaleTransaction[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .where('sale.ownerId = :ownerId', { ownerId })
      .orderBy('sale.date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filter.productName) {
      qb.andWhere('sale.productName ILIKE :name', {
        name: `%${filter.productName}%`,
      });
    }

    // Period shorthand takes precedence over explicit dateFrom/dateTo
    const periodDateFrom = this.resolveHistoryPeriod(filter.period);
    if (periodDateFrom) {
      qb.andWhere('sale.date >= :from', { from: periodDateFrom });
    } else {
      if (filter.dateFrom) {
        qb.andWhere('sale.date >= :from', { from: new Date(filter.dateFrom) });
      }
      if (filter.dateTo) {
        qb.andWhere('sale.date <= :to', { to: new Date(filter.dateTo + 'T23:59:59') });
      }
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async topProducts(
    ownerId: string,
    filter: TopProductsFilterDto,
  ): Promise<TopProduct[]> {
    const { dateFrom, dateTo } = this.resolvePeriod(filter);

    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .select('sale.productName', 'productName')
      .addSelect('SUM(sale.qtySold)', 'totalQtySold')
      .addSelect('SUM(CAST(sale.salePrice AS DECIMAL) * sale.qtySold)', 'totalRevenue')
      .addSelect('SUM(CAST(sale.profit AS DECIMAL))', 'totalProfit')
      .where('sale.ownerId = :ownerId', { ownerId })
      .groupBy('sale.productName');

    if (dateFrom) qb.andWhere('sale.date >= :from', { from: dateFrom });
    if (dateTo) qb.andWhere('sale.date <= :to', { to: dateTo });

    const rows = await qb.getRawMany<{
      productName: string;
      totalQtySold: string;
      totalRevenue: string;
      totalProfit: string;
    }>();

    const mapped = rows.map((r) => ({
      productName: r.productName,
      totalQtySold: Number(r.totalQtySold),
      totalRevenue: new Decimal(r.totalRevenue ?? 0).toFixed(2),
      totalProfit: new Decimal(r.totalProfit ?? 0).toFixed(2),
      isLossProduct: new Decimal(r.totalProfit ?? 0).lt(0),
    }));

    // Sort based on rankBy
    const rankBy = filter.rankBy ?? TopProductsRankBy.PROFIT;
    return mapped.sort((a, b) => {
      if (rankBy === TopProductsRankBy.QTY)
        return b.totalQtySold - a.totalQtySold;
      if (rankBy === TopProductsRankBy.REVENUE)
        return new Decimal(b.totalRevenue).cmp(new Decimal(a.totalRevenue));
      return new Decimal(b.totalProfit).cmp(new Decimal(a.totalProfit));
    });
  }

  private resolveHistoryPeriod(period?: SalesHistoryPeriod): Date | null {
    if (!period || period === SalesHistoryPeriod.ALL) return null;
    const now = new Date();
    const days = period === SalesHistoryPeriod.SEVEN_DAYS ? 7
      : period === SalesHistoryPeriod.THIRTY_DAYS ? 30
      : 90;
    const from = new Date(now);
    from.setDate(now.getDate() - days);
    return from;
  }

  private resolvePeriod(filter: TopProductsFilterDto): {
    dateFrom: Date | null;
    dateTo: Date | null;
  } {
    const now = new Date();
    switch (filter.period) {
      case SalesPeriod.TODAY: {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return { dateFrom: start, dateTo: now };
      }
      case SalesPeriod.WEEK: {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        return { dateFrom: start, dateTo: now };
      }
      case SalesPeriod.MONTH: {
        const start = new Date(now);
        start.setMonth(now.getMonth() - 1);
        return { dateFrom: start, dateTo: now };
      }
      case SalesPeriod.CUSTOM:
        return {
          dateFrom: filter.dateFrom ? new Date(filter.dateFrom) : null,
          dateTo: filter.dateTo ? new Date(filter.dateTo + 'T23:59:59') : null,
        };
      default:
        return { dateFrom: null, dateTo: null };
    }
  }
}
