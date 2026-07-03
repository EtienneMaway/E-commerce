import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import { PricingService } from '../pricing/pricing.service';
import { RecordSaleDto } from './dto/record-sale.dto';
import { UpdateSaleClientDto } from './dto/update-sale-client.dto';
import {
  SalesFilterDto,
  SalesHistoryPeriod,
  SalesPeriod,
  SalesSummaryFilterDto,
  SalesSummaryPeriod,
  TopProductsFilterDto,
  TopProductsRankBy,
} from './dto/sales-filter.dto';
import { PriceGuardWarningDto } from './dto/price-guard-warning.dto';
import { ActorContext } from '../common/types/actor-context';
import { applyActorCondToQb, resolveActorFilter } from '../common/actor-filter';

export interface TopProduct {
  productName: string;
  totalQtySold: number;
  totalRevenue: string;
  totalProfit: string;
  isLossProduct: boolean;
}

export interface SalesProfitSummary {
  /** Echo of the resolved range so the client can label the figures. */
  period: SalesSummaryPeriod;
  dateFrom: string | null; // ISO; null when unbounded ("all")
  dateTo: string | null;
  salesCount: number; // number of sale rows in range
  totalQtySold: number;
  totalRevenue: string; // Σ salePrice × qty — what was sold for
  totalCost: string; // Σ unitCost × qty — the bought price (COGS)
  totalProfit: string; // Σ profit — revenue − cost
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
    private readonly pricingService: PricingService,
  ) {}

  async recordSale(
    ctx: ActorContext,
    dto: RecordSaleDto,
  ): Promise<SaleTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    // Idempotency: the offline sync queue stamps each sale with a stable
    // client-generated key. If a retry lands here after a flaky-network
    // timeout (server already committed, but the response never reached the
    // device), recognise the key and return the existing row instead of
    // recording the sale twice. A split sale produces several rows sharing the
    // same key — returning the first is enough to signal "already done".
    const clientSaleId = dto.clientSaleId?.trim() || null;
    if (clientSaleId) {
      const existing = await this.saleRepo.findOne({
        where: { ownerId, clientSaleId },
        order: { date: 'ASC' },
      });
      if (existing) return existing;
    }

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

    // Apply employee pricing rule (cap or require discount reason).
    // Owner-performed sales pass through unchanged.
    const priceCheck = await this.pricingService.applyEmployeePriceRule({
      ctx,
      productName: dto.productName,
      submittedUnitPrice: dto.salePrice,
      discountReason: dto.discountReason,
    });
    const effectiveSalePrice = new Decimal(priceCheck.effectiveUnitPrice);

    // Price guard — uses unit cost of the first entry to be deducted.
    const firstEntry = allEntries[0];
    const unitCost = new Decimal(firstEntry.unitCost);

    if (effectiveSalePrice.lte(unitCost) && !dto.confirmedOverride) {
      const potentialLoss = unitCost.minus(effectiveSalePrice).mul(dto.qtySold).toFixed(4);
      const warning: PriceGuardWarningDto = {
        warning: true,
        costPrice: unitCost.toFixed(4),
        potentialLoss,
        message:
          `Selling at ${effectiveSalePrice.toFixed(4)} is at or below cost price of ${unitCost.toFixed(4)}. ` +
          `You will lose ${potentialLoss} total. ` +
          `Send confirmedOverride: true to proceed.`,
      };
      throw new UnprocessableEntityException(warning);
    }

    // A mini sends the FC price the customer paid so each deducted lot books at
    // its OWN locked rate — a sale straddling two batches given at different
    // rates is exact per batch. Null for owner/full sales (single USD price).
    const salePriceFc = dto.salePriceFc ? new Decimal(dto.salePriceFc) : null;

    return this.dataSource.transaction(async (manager) => {
      const sales: SaleTransaction[] = [];
      let remaining = dto.qtySold;

      for (const entry of allEntries) {
        if (remaining === 0) break;

        const deduct = Math.min(entry.quantityRemaining, remaining);
        const entryCost = new Decimal(entry.unitCost);
        // Per-lot USD sale price: when the mini supplied an FC price AND this lot
        // carries a locked rate, convert at that rate; otherwise use the single
        // USD price. Keeps profit/owed exact per batch.
        const lotSalePrice =
          salePriceFc && entry.usdToFcRateSnapshot
            ? salePriceFc.div(new Decimal(entry.usdToFcRateSnapshot))
            : effectiveSalePrice;
        const entryProfit = lotSalePrice.minus(entryCost).mul(deduct);
        const qtyBeforeDeduct = entry.quantityRemaining;

        entry.quantityRemaining -= deduct;
        remaining -= deduct;
        await manager.save(InventoryEntry, entry);

        const sale = manager.create(SaleTransaction, {
          ownerId,
          actorId,
          productName: entry.productName,
          source: entry.source,
          supplierUserId: entry.supplierUserId,
          qtySold: deduct,
          unitCost: entryCost.toFixed(4),
          salePrice: lotSalePrice.toFixed(4),
          profit: entryProfit.toFixed(4),
          isLoss: entryProfit.lt(0),
          inventoryEntryId: entry.id,
          // Carry the lot's locked rate (set only on a mini's CONSIGNED_IN
          // stock) so this sale's owed value + markup convert to FC at the
          // consignment's give-time rate, not the live one.
          usdToFcRateSnapshot: entry.usdToFcRateSnapshot ?? null,
          originalUnitPrice: priceCheck.originalUnitPrice,
          discountReason: priceCheck.originalUnitPrice ? dto.discountReason ?? null : null,
          clientName: dto.clientName?.trim() || null,
          clientPhone: dto.clientPhone?.trim() || null,
          receiptId: dto.receiptId?.trim() || null,
          clientSaleId,
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

      return sales[0];
    });
  }

  async findAll(
    ctx: ActorContext,
    filter: SalesFilterDto,
  ): Promise<{ data: SaleTransaction[]; total: number }> {
    const ownerId = ctx.effectiveOwnerId;
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;

    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.actor', 'actor')
      .where('sale.ownerId = :ownerId', { ownerId })
      .orderBy('sale.date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filter.productName) {
      qb.andWhere('sale.productName ILIKE :name', {
        name: `%${filter.productName}%`,
      });
    }
    applyActorCondToQb(qb, 'sale.actor_id', resolveActorFilter(filter.actorId, ctx));
    if (filter.clientQuery) {
      // Case-insensitive match across name + phone so the merchant can search
      // a partial name or any phone-number chunk.
      qb.andWhere(
        '(sale.client_name ILIKE :clientQ OR sale.client_phone ILIKE :clientQ)',
        { clientQ: `%${filter.clientQuery.trim()}%` },
      );
    }

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

  /**
   * Attach (or update) the buyer's name + phone on a previously recorded
   * sale. Designed for the mobile post-sale receipt prompt: the sale is
   * created first, then if the merchant fills the optional client fields,
   * we PATCH them in. When `receiptId` is set we update all sibling rows
   * created by the same cart submission in one call — matching how the
   * mobile prompt covers the whole receipt, not just one line.
   */
  async updateClient(
    ctx: ActorContext,
    saleId: string,
    dto: UpdateSaleClientDto,
  ): Promise<SaleTransaction[]> {
    const ownerId = ctx.effectiveOwnerId;
    const sale = await this.saleRepo.findOne({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.ownerId !== ownerId) {
      throw new ForbiddenException('You cannot edit this sale');
    }

    const clientName = dto.clientName?.trim() || null;
    const clientPhone = dto.clientPhone?.trim() || null;

    // Group reprint: if this sale carries a receiptId, propagate the same
    // client info across every row in the receipt so a later search by
    // phone surfaces the whole transaction, not just one line.
    const targets = sale.receiptId
      ? await this.saleRepo.find({ where: { ownerId, receiptId: sale.receiptId } })
      : [sale];

    for (const t of targets) {
      t.clientName = clientName;
      t.clientPhone = clientPhone;
    }
    await this.saleRepo.save(targets);
    return targets;
  }

  /**
   * Returns every sale row that came out of the same cart submission. Used
   * by the mobile sales tab's reprint flow: tap one row → reconstruct the
   * original multi-item receipt.
   */
  async findByReceipt(ctx: ActorContext, receiptId: string): Promise<SaleTransaction[]> {
    const ownerId = ctx.effectiveOwnerId;
    return this.saleRepo.find({
      where: { ownerId, receiptId },
      relations: { actor: true, inventoryEntry: true },
      order: { date: 'ASC' },
    });
  }

  async topProducts(
    ctx: ActorContext,
    filter: TopProductsFilterDto,
  ): Promise<TopProduct[]> {
    const ownerId = ctx.effectiveOwnerId;
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
      totalRevenue: new Decimal(r.totalRevenue ?? 0).toFixed(4),
      totalProfit: new Decimal(r.totalProfit ?? 0).toFixed(4),
      isLossProduct: new Decimal(r.totalProfit ?? 0).lt(0),
    }));

    const rankBy = filter.rankBy ?? TopProductsRankBy.PROFIT;
    return mapped.sort((a, b) => {
      if (rankBy === TopProductsRankBy.QTY)
        return b.totalQtySold - a.totalQtySold;
      if (rankBy === TopProductsRankBy.REVENUE)
        return new Decimal(b.totalRevenue).cmp(new Decimal(a.totalRevenue));
      return new Decimal(b.totalProfit).cmp(new Decimal(a.totalProfit));
    });
  }

  /**
   * Aggregate profit over a period or custom date range for DIRECT sales —
   * what was sold (revenue) vs the bought price (COGS) and the profit between
   * them. Powers the dashboard's "today's / this range's profit" view.
   *
   * Scope: `sale_transactions` only (consignment + external-contact profit are
   * realized separately and excluded here, matching what a merchant means by
   * "sales I made compared to what I bought them for").
   */
  async profitSummary(
    ctx: ActorContext,
    filter: SalesSummaryFilterDto,
  ): Promise<SalesProfitSummary> {
    const ownerId = ctx.effectiveOwnerId;
    const period = filter.period ?? SalesSummaryPeriod.TODAY;
    const { dateFrom, dateTo } = this.resolveSummaryPeriod(filter);

    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .select('COUNT(*)', 'salesCount')
      .addSelect('COALESCE(SUM(sale.qtySold), 0)', 'totalQtySold')
      .addSelect(
        'COALESCE(SUM(CAST(sale.salePrice AS DECIMAL) * sale.qtySold), 0)',
        'totalRevenue',
      )
      .addSelect(
        'COALESCE(SUM(CAST(sale.unitCost AS DECIMAL) * sale.qtySold), 0)',
        'totalCost',
      )
      .addSelect('COALESCE(SUM(CAST(sale.profit AS DECIMAL)), 0)', 'totalProfit')
      .where('sale.ownerId = :ownerId', { ownerId });

    if (filter.productName) {
      qb.andWhere('sale.productName ILIKE :name', { name: `%${filter.productName}%` });
    }
    applyActorCondToQb(qb, 'sale.actor_id', resolveActorFilter(filter.actorId, ctx));
    if (dateFrom) qb.andWhere('sale.date >= :from', { from: dateFrom });
    if (dateTo) qb.andWhere('sale.date <= :to', { to: dateTo });

    const row = await qb.getRawOne<{
      salesCount: string;
      totalQtySold: string;
      totalRevenue: string;
      totalCost: string;
      totalProfit: string;
    }>();

    return {
      period,
      dateFrom: dateFrom ? dateFrom.toISOString() : null,
      dateTo: dateTo ? dateTo.toISOString() : null,
      salesCount: Number(row?.salesCount ?? 0),
      totalQtySold: Number(row?.totalQtySold ?? 0),
      totalRevenue: new Decimal(row?.totalRevenue ?? 0).toFixed(4),
      totalCost: new Decimal(row?.totalCost ?? 0).toFixed(4),
      totalProfit: new Decimal(row?.totalProfit ?? 0).toFixed(4),
    };
  }

  private resolveSummaryPeriod(filter: SalesSummaryFilterDto): {
    dateFrom: Date | null;
    dateTo: Date | null;
  } {
    const now = new Date();
    switch (filter.period ?? SalesSummaryPeriod.TODAY) {
      case SalesSummaryPeriod.TODAY: {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return { dateFrom: start, dateTo: now };
      }
      case SalesSummaryPeriod.WEEK: {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        return { dateFrom: start, dateTo: now };
      }
      case SalesSummaryPeriod.MONTH: {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        return { dateFrom: start, dateTo: now };
      }
      case SalesSummaryPeriod.CUSTOM:
        return {
          dateFrom: filter.dateFrom ? new Date(filter.dateFrom) : null,
          dateTo: filter.dateTo ? new Date(filter.dateTo + 'T23:59:59') : null,
        };
      case SalesSummaryPeriod.ALL:
      default:
        return { dateFrom: null, dateTo: null };
    }
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
