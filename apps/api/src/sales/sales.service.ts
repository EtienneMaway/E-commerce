import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import {
  InventoryEntry,
  InventorySource,
  ProductGroup,
  ProductVariant,
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

/**
 * Split a carton's effective price across its sizes, pro-rata by each size's
 * standalone selling-price share, so the per-piece prices sum back to the carton
 * price while preserving the ratio between sizes. Returns one per-piece USD price
 * per gating size, in the same order.
 */
export function allocateCartonUnitPrices(
  cartonUnitPrice: Decimal,
  gating: { sellingPrice: string; piecesPerCarton: number }[],
): Decimal[] {
  const total = gating.reduce(
    (acc, v) => acc.plus(new Decimal(v.sellingPrice).mul(v.piecesPerCarton)),
    new Decimal(0),
  );
  if (total.lte(0)) {
    throw new BadRequestException(
      'Cannot allocate carton price — sizes have no selling price',
    );
  }
  return gating.map((v) => cartonUnitPrice.mul(v.sellingPrice).div(total));
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
    @InjectRepository(ProductGroup)
    private readonly groupRepo: Repository<ProductGroup>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
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

    const base = { ownerId, actorId, clientSaleId };
    return dto.carton
      ? this.recordCartonSale(ctx, dto, base)
      : this.recordSingleSale(ctx, dto, base);
  }

  /** Ordered sellable lots (SUPPLIER → CONSIGNED_IN → PERSONAL, FIFO within each). */
  private async fetchSellableLots(
    ownerId: string,
    key: { productName?: string; variantId?: string },
  ): Promise<InventoryEntry[]> {
    const match = key.variantId
      ? { variantId: key.variantId }
      : { productName: ILike((key.productName ?? '').trim().toLowerCase()) };

    const bySource = (source: InventorySource) =>
      this.entryRepo.find({
        where: { ownerId, ...match, source },
        order: { createdAt: 'ASC' },
      });

    const [supplier, consignedIn, personal] = await Promise.all([
      bySource(InventorySource.SUPPLIER),
      bySource(InventorySource.CONSIGNED_IN),
      bySource(InventorySource.PERSONAL),
    ]);
    return [...supplier, ...consignedIn, ...personal].filter(
      (e) => e.quantityRemaining > 0,
    );
  }

  /**
   * A simple product sale, or a single-size sale of a sized product. Unchanged
   * behavior for simple products; when `variantId` is set, stock is looked up by
   * size and the sale rows are tagged with the variant.
   */
  private async recordSingleSale(
    ctx: ActorContext,
    dto: RecordSaleDto,
    base: {
      ownerId: string;
      actorId: string | null;
      clientSaleId: string | null;
    },
  ): Promise<SaleTransaction> {
    const { ownerId, actorId, clientSaleId } = base;

    const qtySold = dto.qtySold;
    if (!qtySold || qtySold <= 0) {
      throw new BadRequestException(
        'qtySold is required for a non-carton sale',
      );
    }

    let variant: ProductVariant | null = null;
    if (dto.variantId) {
      variant = await this.variantRepo.findOne({
        where: { id: dto.variantId },
      });
      if (!variant) throw new BadRequestException('Size not found');
    }

    const allEntries = await this.fetchSellableLots(
      ownerId,
      dto.variantId
        ? { variantId: dto.variantId }
        : { productName: dto.productName },
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
    if (totalAvailable < qtySold) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${totalAvailable}, requested: ${qtySold}`,
      );
    }

    // Apply employee pricing rule (cap or require discount reason). Owner sales
    // pass through. For a sized product the standard is the size's own price
    // (null for a mini, who keeps their markup); for a simple product the rule
    // falls back to the name-based ProductPrice lookup.
    const priceCheck = await this.pricingService.applyEmployeePriceRule({
      ctx,
      productName: dto.productName,
      submittedUnitPrice: dto.salePrice,
      discountReason: dto.discountReason,
      standardPrice: variant
        ? ctx.tier === 'MINI_EMPLOYEE'
          ? null
          : variant.sellingPrice
        : undefined,
    });
    const effectiveSalePrice = new Decimal(priceCheck.effectiveUnitPrice);

    // Price guard — uses unit cost of the first entry to be deducted.
    const unitCost = new Decimal(allEntries[0].unitCost);
    if (effectiveSalePrice.lte(unitCost) && !dto.confirmedOverride) {
      const potentialLoss = unitCost
        .minus(effectiveSalePrice)
        .mul(qtySold)
        .toFixed(4);
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
      let remaining = qtySold;

      for (const entry of allEntries) {
        if (remaining === 0) break;

        const deduct = Math.min(entry.quantityRemaining, remaining);
        const entryCost = new Decimal(entry.unitCost);
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
          usdToFcRateSnapshot: entry.usdToFcRateSnapshot ?? null,
          originalUnitPrice: priceCheck.originalUnitPrice,
          discountReason: priceCheck.originalUnitPrice
            ? (dto.discountReason ?? null)
            : null,
          clientName: dto.clientName?.trim() || null,
          clientPhone: dto.clientPhone?.trim() || null,
          receiptId: dto.receiptId?.trim() || null,
          clientSaleId,
          variantId: variant?.id ?? null,
          variantLabel: variant?.label ?? null,
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

  /**
   * Sell one or more WHOLE cartons of a sized product at the group's discounted
   * carton price. Deducts the carton composition across every size (each size
   * SUPPLIER → CONSIGNED_IN → PERSONAL FIFO), allocates the carton price across
   * sizes pro-rata by standalone price, and books one SaleTransaction per lot,
   * all sharing a cartonSaleId. The price guard fires at the carton TOTAL, not
   * per size — a discounted carton legitimately prices some sizes below their
   * standalone price.
   */
  private async recordCartonSale(
    ctx: ActorContext,
    dto: RecordSaleDto,
    base: {
      ownerId: string;
      actorId: string | null;
      clientSaleId: string | null;
    },
  ): Promise<SaleTransaction> {
    const { ownerId, actorId, clientSaleId } = base;

    if (!dto.groupId) {
      throw new BadRequestException('groupId is required for a carton sale');
    }
    const cartonQty = dto.cartonQty ?? 1;

    const group = await this.groupRepo.findOne({
      where: { id: dto.groupId },
      relations: { variants: true },
    });
    if (!group) throw new BadRequestException('Product group not found');
    if (group.cartonSellingPrice == null) {
      throw new BadRequestException(
        'Whole-carton selling is not enabled for this product',
      );
    }

    // The carton composition = sizes with a positive pieces-per-carton.
    const gating = (group.variants ?? [])
      .filter((v) => !v.archived && v.piecesPerCarton > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (gating.length === 0) {
      throw new BadRequestException('This product has no carton composition');
    }

    // Employee pricing rule against the group carton price (null standard for a
    // mini so their carton markup is theirs to keep).
    const priceCheck = await this.pricingService.applyEmployeePriceRule({
      ctx,
      productName: group.name,
      submittedUnitPrice: dto.salePrice,
      discountReason: dto.discountReason,
      standardPrice:
        ctx.tier === 'MINI_EMPLOYEE' ? null : group.cartonSellingPrice,
    });
    const cartonUnitPrice = new Decimal(priceCheck.effectiveUnitPrice); // per one carton
    const allocated = allocateCartonUnitPrices(cartonUnitPrice, gating);

    // Build the deduction plan and total cost before committing so the price
    // guard sees the exact cost of the lots that will actually be drained.
    interface LotDeduction {
      entry: InventoryEntry;
      deduct: number;
      allocatedUnitPrice: Decimal;
      variant: ProductVariant;
    }
    const plan: LotDeduction[] = [];
    let totalCost = new Decimal(0);

    for (let i = 0; i < gating.length; i++) {
      const variant = gating[i];
      const need = variant.piecesPerCarton * cartonQty;
      const lots = await this.fetchSellableLots(ownerId, {
        variantId: variant.id,
      });
      const available = lots.reduce((s, e) => s + e.quantityRemaining, 0);
      if (available < need) {
        throw new BadRequestException(
          `Insufficient stock for size "${variant.label}". Need ${need}, have ${available}.`,
        );
      }
      let remaining = need;
      for (const lot of lots) {
        if (remaining === 0) break;
        const deduct = Math.min(lot.quantityRemaining, remaining);
        remaining -= deduct;
        totalCost = totalCost.plus(new Decimal(lot.unitCost).mul(deduct));
        plan.push({
          entry: lot,
          deduct,
          allocatedUnitPrice: allocated[i],
          variant,
        });
      }
    }

    // Carton-level price guard: warn only if the whole carton is at/under cost.
    const revenue = cartonUnitPrice.mul(cartonQty);
    if (revenue.lte(totalCost) && !dto.confirmedOverride) {
      const potentialLoss = totalCost.minus(revenue).toFixed(4);
      const warning: PriceGuardWarningDto = {
        warning: true,
        costPrice: totalCost.toFixed(4),
        potentialLoss,
        message:
          `Selling ${cartonQty} carton(s) at ${revenue.toFixed(4)} is at or below total cost of ${totalCost.toFixed(4)}. ` +
          `You will lose ${potentialLoss} total. ` +
          `Send confirmedOverride: true to proceed.`,
      };
      throw new UnprocessableEntityException(warning);
    }

    const cartonSaleId = randomUUID();

    return this.dataSource.transaction(async (manager) => {
      const sales: SaleTransaction[] = [];

      for (const p of plan) {
        const lotCost = new Decimal(p.entry.unitCost);
        const profit = p.allocatedUnitPrice.minus(lotCost).mul(p.deduct);
        const qtyBeforeDeduct = p.entry.quantityRemaining;

        p.entry.quantityRemaining -= p.deduct;
        await manager.save(InventoryEntry, p.entry);

        const sale = manager.create(SaleTransaction, {
          ownerId,
          actorId,
          productName: p.entry.productName,
          source: p.entry.source,
          supplierUserId: p.entry.supplierUserId,
          qtySold: p.deduct,
          unitCost: lotCost.toFixed(4),
          salePrice: p.allocatedUnitPrice.toFixed(4),
          profit: profit.toFixed(4),
          isLoss: profit.lt(0),
          inventoryEntryId: p.entry.id,
          usdToFcRateSnapshot: p.entry.usdToFcRateSnapshot ?? null,
          originalUnitPrice: priceCheck.originalUnitPrice,
          discountReason: priceCheck.originalUnitPrice
            ? (dto.discountReason ?? null)
            : null,
          clientName: dto.clientName?.trim() || null,
          clientPhone: dto.clientPhone?.trim() || null,
          receiptId: dto.receiptId?.trim() || null,
          clientSaleId,
          variantId: p.variant.id,
          variantLabel: p.variant.label,
          cartonSaleId,
        });
        const savedSale = await manager.save(SaleTransaction, sale);
        sales.push(savedSale);

        await this.stockMovements.record(manager, {
          ownerId,
          entry: p.entry,
          reason: StockMovementReason.SALE,
          qty: p.deduct,
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
    applyActorCondToQb(
      qb,
      'sale.actor_id',
      resolveActorFilter(filter.actorId, ctx),
    );
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
        qb.andWhere('sale.date <= :to', {
          to: new Date(filter.dateTo + 'T23:59:59'),
        });
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
      ? await this.saleRepo.find({
          where: { ownerId, receiptId: sale.receiptId },
        })
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
  async findByReceipt(
    ctx: ActorContext,
    receiptId: string,
  ): Promise<SaleTransaction[]> {
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
      .addSelect(
        'SUM(CAST(sale.salePrice AS DECIMAL) * sale.qtySold)',
        'totalRevenue',
      )
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
      .addSelect(
        'COALESCE(SUM(CAST(sale.profit AS DECIMAL)), 0)',
        'totalProfit',
      )
      .where('sale.ownerId = :ownerId', { ownerId });

    if (filter.productName) {
      qb.andWhere('sale.productName ILIKE :name', {
        name: `%${filter.productName}%`,
      });
    }
    applyActorCondToQb(
      qb,
      'sale.actor_id',
      resolveActorFilter(filter.actorId, ctx),
    );
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
    const days =
      period === SalesHistoryPeriod.SEVEN_DAYS
        ? 7
        : period === SalesHistoryPeriod.THIRTY_DAYS
          ? 30
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
