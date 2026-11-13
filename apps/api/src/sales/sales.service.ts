import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import {
  InventoryEntry,
  InventorySource,
  MiniSettlement,
  MiniSettlementStatus,
  ProductGroup,
  ProductVariant,
  SaleTransaction,
  StockMovementReason,
} from '../entities';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CustodyService } from '../custody/custody.service';
import { holderCond, holderScope, isOnMyBooks, readScope, writeScope } from '../common/shop-scope';
import { PricingService } from '../pricing/pricing.service';
import { RecordSaleDto } from './dto/record-sale.dto';
import { UpdateSaleClientDto } from './dto/update-sale-client.dto';
import { RejectSaleDto } from './dto/reject-sale.dto';
import { AmendSaleDto } from './dto/amend-sale.dto';
import {
  SalesFilterDto,
  SalesHistoryPeriod,
  SalesPeriod,
  SalesStatusFilter,
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
    @InjectRepository(MiniSettlement)
    private readonly settlementRepo: Repository<MiniSettlement>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
    private readonly pricingService: PricingService,
    private readonly custody: CustodyService,
  ) {}

  /**
   * Record a sale. When `externalManager` is passed the sale is recorded on
   * that transaction (and that transaction's uncommitted state is visible to
   * the lot lookups) instead of opening its own — this is how {@link amendSale}
   * re-records a corrected sale in the same atomic unit as the void. The
   * idempotency short-circuit and the mini open-handover pre-check only apply
   * to a fresh sale, not to an amend (which runs its own guards first).
   */
  async recordSale(
    ctx: ActorContext,
    dto: RecordSaleDto,
    externalManager?: EntityManager,
  ): Promise<SaleTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;
    const clientSaleId = dto.clientSaleId?.trim() || null;

    if (!externalManager) {
      // Idempotency: the offline sync queue stamps each sale with a stable
      // client-generated key. If a retry lands here after a flaky-network
      // timeout (server already committed, but the response never reached the
      // device), recognise the key and return the existing row instead of
      // recording the sale twice. A split sale produces several rows sharing
      // the same key — returning the first is enough to signal "already done".
      if (clientSaleId) {
        const existing = await this.saleRepo.findOne({
          where: { ...holderScope(ctx), clientSaleId },
          order: { date: 'ASC' },
        });
        if (existing) return existing;
      }

      // A mini employee hands back cash *and* the unsold goods, so once a
      // handover is awaiting approval they are physically holding nothing to
      // sell. The stock only leaves their books on approval, so without this the
      // app would still offer phantom stock — and the sale would land in the gap
      // between the handover's window and the next one, where no settlement
      // accounts for it.
      if (ctx.tier === 'MINI_EMPLOYEE') {
        const openHandover = await this.settlementRepo.findOne({
          // tenancy-exempt: miniId names the PERSON handing over, not a set of
          // books. Their handover is theirs at whichever branch they work.
          where: { miniId: ownerId, status: MiniSettlementStatus.PENDING },
        });
        if (openHandover) {
          throw new ConflictException(
            'Your handover is waiting for approval — you cannot record sales until your employer approves or rejects it',
          );
        }
      }
    }

    // `ownerId` is still written until migration 034 drops the column, which is
    // what keeps each module of Phase 4 independently shippable.
    const base = { ownerId, actorId, clientSaleId, ...writeScope(ctx) };
    const run = (manager: EntityManager): Promise<SaleTransaction> =>
      dto.carton
        ? this.recordCartonSale(ctx, dto, base, manager)
        : this.recordSingleSale(ctx, dto, base, manager);
    return externalManager
      ? run(externalManager)
      : this.dataSource.transaction(run);
  }

  /**
   * Decide what to record for `originalUnitPrice` / `discountReason` on a sale
   * row. The employee pricing rule's captured original (an employee selling
   * below the owner's standard) takes precedence; otherwise fall back to a
   * client-supplied `originalUnitPrice` (a quantity discount applied by an owner
   * or mini, whom the rule passes through). A reason is stored only when there
   * is a captured original.
   */
  private resolveDiscountCapture(
    ruleOriginal: string | null,
    dto: RecordSaleDto,
  ): { originalUnitPrice: string | null; discountReason: string | null } {
    const dtoOriginal = dto.originalUnitPrice?.trim()
      ? new Decimal(dto.originalUnitPrice).toFixed(4)
      : null;
    const originalUnitPrice = ruleOriginal ?? dtoOriginal;
    const discountReason = originalUnitPrice
      ? dto.discountReason?.trim() || null
      : null;
    return { originalUnitPrice, discountReason };
  }

  /** Ordered sellable lots (SUPPLIER → CONSIGNED_IN → PERSONAL, FIFO within each). */
  /**
   * Business rule 2 (SUPPLIER first) still holds — now *within a branch*. Two
   * branches stocking the same product never draw on each other's shelves.
   */
  private async fetchSellableLots(
    ctx: ActorContext,
    key: { productName?: string; variantId?: string },
    manager: EntityManager,
  ): Promise<InventoryEntry[]> {
    const match = key.variantId
      ? { variantId: key.variantId }
      : { productName: ILike((key.productName ?? '').trim().toLowerCase()) };

    const bySource = (source: InventorySource) =>
      // Read through the transaction manager so a sale being re-recorded inside
      // an amend sees the stock that same transaction just restored.
      manager.find(InventoryEntry, {
        // The seller's own lots only: a mini's consigned lot sits at the same
        // branch but is theirs to sell, and the owner's shelf is not the mini's.
        where: { ...holderScope(ctx), ...match, source },
        order: { createdAt: 'ASC' },
      });

    const [supplier, consignedIn, personal] = await Promise.all([
      bySource(InventorySource.SUPPLIER),
      bySource(InventorySource.CONSIGNED_IN),
      bySource(InventorySource.PERSONAL),
    ]);
    // Custody narrows what `holderScope` already returned (SHOP_CUSTODY_PLAN.md
    // §3.4). A lot stamped to a custodian is sellable only by that custodian,
    // by someone on their team, or by the owner; everyone else sees it as if it
    // were not there, which is what "not on the team cannot access the stock"
    // means in practice. Unassigned lots (`custodianId === null`) keep today's
    // rules, so a branch with no custodian behaves exactly as it always has.
    const allowedCustodians = await this.custody.allowedCustodianIds(ctx);
    return [...supplier, ...consignedIn, ...personal].filter(
      (e) =>
        e.quantityRemaining > 0 &&
        // Falsy, not `=== null`: an unassigned lot reaches here as null from the
        // database and as undefined from anything that built an entry without
        // the column. Both mean the same thing — nobody is holding it.
        (!e.custodianId || allowedCustodians.has(e.custodianId)),
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
      orgId: string;
      shopId: string;
    },
    manager: EntityManager,
  ): Promise<SaleTransaction> {
    const { ownerId, actorId, clientSaleId, orgId, shopId } = base;

    const qtySold = dto.qtySold;
    if (!qtySold || qtySold <= 0) {
      throw new BadRequestException(
        'qtySold is required for a non-carton sale',
      );
    }

    let variant: ProductVariant | null = null;
    if (dto.variantId) {
      variant = await manager.findOne(ProductVariant, {
        where: { id: dto.variantId },
      });
      if (!variant) throw new BadRequestException('Size not found');
    }

    const allEntries = await this.fetchSellableLots(
      ctx,
      dto.variantId
        ? { variantId: dto.variantId }
        : { productName: dto.productName },
      manager,
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

    // Preserve the pre-discount price on the row. The employee pricing rule
    // captures it when an employee sells below the owner's standard; for a
    // client-applied quantity ("group of prices") discount the client sends it
    // explicitly, since the rule passes owner sales (and mini markups) through.
    const {
      originalUnitPrice: resolvedOriginal,
      discountReason: resolvedReason,
    } = this.resolveDiscountCapture(priceCheck.originalUnitPrice, dto);

    // Price guard — uses unit cost of the first entry to be deducted. For a
    // mini employee that "cost" is the consignment's agreedUnitPrice (the
    // price the employer assigned them) — selling at exactly that price is
    // the expected break-even floor, not a mistake, so only strictly BELOW
    // it warns. Owner/full-employee cost is a real inventory cost basis, so
    // that rule stays "at or below" as documented.
    const unitCost = new Decimal(allEntries[0].unitCost);
    const isAtOrBelowCost =
      ctx.tier === 'MINI_EMPLOYEE'
        ? effectiveSalePrice.lt(unitCost)
        : effectiveSalePrice.lte(unitCost);
    if (isAtOrBelowCost && !dto.confirmedOverride) {
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

      const custodyStamp = await this.custody.saleStamp(ctx, entry);
      const sale = manager.create(SaleTransaction, {
        ownerId,
        orgId,
        shopId,
        actorId,
        ...custodyStamp,
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
        originalUnitPrice: resolvedOriginal,
        discountReason: resolvedReason,
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
      orgId: string;
      shopId: string;
    },
    manager: EntityManager,
  ): Promise<SaleTransaction> {
    const { ownerId, actorId, clientSaleId, orgId, shopId } = base;

    if (!dto.groupId) {
      throw new BadRequestException('groupId is required for a carton sale');
    }
    const cartonQty = dto.cartonQty ?? 1;

    const group = await manager.findOne(ProductGroup, {
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
    const {
      originalUnitPrice: resolvedOriginal,
      discountReason: resolvedReason,
    } = this.resolveDiscountCapture(priceCheck.originalUnitPrice, dto);

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
      const lots = await this.fetchSellableLots(
        ctx,
        { variantId: variant.id },
        manager,
      );
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
    // Same mini-employee carve-out as the per-piece guard above — their
    // "cost" here is the sum of each size's agreedUnitPrice, i.e. exactly
    // what they were assigned, so break-even at that price is expected.
    const revenue = cartonUnitPrice.mul(cartonQty);
    const isCartonAtOrBelowCost =
      ctx.tier === 'MINI_EMPLOYEE' ? revenue.lt(totalCost) : revenue.lte(totalCost);
    if (isCartonAtOrBelowCost && !dto.confirmedOverride) {
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

    const sales: SaleTransaction[] = [];

    for (const p of plan) {
      const lotCost = new Decimal(p.entry.unitCost);
      const profit = p.allocatedUnitPrice.minus(lotCost).mul(p.deduct);
      const qtyBeforeDeduct = p.entry.quantityRemaining;

      p.entry.quantityRemaining -= p.deduct;
      await manager.save(InventoryEntry, p.entry);

      const custodyStamp = await this.custody.saleStamp(ctx, p.entry);
      const sale = manager.create(SaleTransaction, {
        ownerId,
        orgId,
        shopId,
        actorId,
        ...custodyStamp,
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
        originalUnitPrice: resolvedOriginal,
        discountReason: resolvedReason,
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
  }

  async findAll(
    ctx: ActorContext,
    filter: SalesFilterDto,
  ): Promise<{ data: SaleTransaction[]; total: number; totals?: { revenue: string; profit: string } }> {
    const ownerId = ctx.effectiveOwnerId;
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;

    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.actor', 'actor')
      .leftJoinAndSelect('sale.rejectedBy', 'rejectedBy')
      .where(...holderCond('sale', ctx))
      .orderBy('sale.date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Rejected sales are kept, not deleted — they only ever appear when asked
    // for. Anything that predates the `status` param keeps listing live sales.
    const status = filter.status ?? SalesStatusFilter.ACTIVE;
    if (status === SalesStatusFilter.ACTIVE) {
      qb.andWhere('sale.rejected_at IS NULL');
    } else if (status === SalesStatusFilter.REJECTED) {
      qb.andWhere('sale.rejected_at IS NOT NULL');
    }

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

    // Totals for the WHOLE filter, not just this page — a phone scrolling page
    // by page would otherwise sum only the rows it had loaded so far. Page 1
    // only: later pages share the same filter, so the client keeps page 1's.
    const wantTotals = (filter.page ?? 1) === 1;
    const [[data, total], sums] = await Promise.all([
      qb.getManyAndCount(),
      wantTotals
        ? qb
            .clone()
            .skip(undefined)
            .take(undefined)
            .orderBy()
            .select('COALESCE(SUM(CAST(sale.salePrice AS DECIMAL) * sale.qtySold), 0)', 'revenue')
            .addSelect('COALESCE(SUM(CAST(sale.profit AS DECIMAL)), 0)', 'profit')
            .getRawOne<{ revenue: string; profit: string }>()
        : Promise.resolve(undefined),
    ]);
    if (!sums) return { data, total };
    return {
      data,
      total,
      totals: {
        revenue: new Decimal(sums.revenue).toFixed(4),
        profit: new Decimal(sums.profit).toFixed(4),
      },
    };
  }

  /**
   * Reject a sale recorded by mistake.
   *
   * The row is **never deleted**: it is stamped with when/who/why and stays in
   * the history, listed under rejected sales. Its quantity goes straight back
   * onto the lot it came off, logged as a `SALE_REJECTED` stock movement, and
   * every money/stock figure in the app skips it from then on (they all filter
   * `rejected_at IS NULL`), so revenue, profit, cash position, the mini's
   * "cash to hand over" and their expense allowance all fall back by exactly
   * this sale.
   *
   * Scope is one sale ROW — the unit the merchant sees in the list. A sale that
   * had to be split across two lots shows as two rows and is rejected as two.
   *
   * Idempotent: rejecting an already-rejected sale returns it untouched rather
   * than restoring the stock a second time. That is what makes the offline
   * queue safe to replay.
   *
   * A mini employee may only reject inside the cycle they have not handed over
   * yet — once a handover is submitted (or approved) those sales are settled
   * money between them and their employer, and unpicking them would rewrite a
   * report both sides have already agreed on.
   */
  async rejectSale(
    ctx: ActorContext,
    saleId: string,
    dto: RejectSaleDto,
  ): Promise<SaleTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const sale = await this.saleRepo.findOne({ where: { id: saleId } });
    // Holder included: an owner must not void a mini's sale (it would put stock
    // back onto the mini's lot and rewrite the mini's handover).
    if (!sale || !isOnMyBooks(sale, ctx)) {
      throw new NotFoundException('Sale not found');
    }

    // Already rejected — return as-is. A retry from the offline queue lands
    // here, and restoring the stock again would invent inventory.
    if (sale.rejectedAt) return sale;

    await this.assertMiniSaleNotSealed(ctx, sale, 'reject');

    const rejectedById = ctx.actorId;
    const reason = dto.reason?.trim() || null;

    return this.dataSource.transaction(async (manager) => {
      // Re-read inside the transaction and re-check the flag: two devices
      // syncing the same offline rejection must not both restore the stock.
      const fresh = await manager.findOne(SaleTransaction, {
        where: { id: sale.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!fresh) throw new NotFoundException('Sale not found');
      if (fresh.rejectedAt) return fresh;

      const entry = await manager.findOne(InventoryEntry, {
        where: { id: fresh.inventoryEntryId },
      });
      // The lot is normally still there (entries are never deleted, only
      // depleted). If it somehow is not, the sale is still voided — losing the
      // record would be worse than not being able to put the pieces back.
      if (entry) {
        const qtyBefore = entry.quantityRemaining;
        entry.quantityRemaining += fresh.qtySold;
        await manager.save(InventoryEntry, entry);

        await this.stockMovements.record(manager, {
          ownerId,
          entry,
          reason: StockMovementReason.SALE_REJECTED,
          qty: fresh.qtySold,
          qtyBefore,
          notes: reason,
          saleTransactionId: fresh.id,
        });
      }

      fresh.rejectedAt = new Date();
      fresh.rejectedById = rejectedById;
      fresh.rejectionReason = reason;
      return manager.save(SaleTransaction, fresh);
    });
  }

  /**
   * A mini employee may not reject or amend a sale once the cash and goods for
   * its cycle have been handed back: while a handover is PENDING the books are
   * frozen, and once a cycle is APPROVED its settlement is sealed. Shared by
   * reject and amend so both enforce the identical rule. `action` only shapes
   * the message. No-op for owner / full-employee sales.
   */
  private async assertMiniSaleNotSealed(
    ctx: ActorContext,
    sale: SaleTransaction,
    action: 'reject' | 'amend',
  ): Promise<void> {
    if (ctx.tier !== 'MINI_EMPLOYEE') return;
    const miniId = ctx.effectiveOwnerId;
    const pending = await this.settlementRepo.findOne({
      // tenancy-exempt: miniId names the PERSON handing over, not a set of books.
      where: { miniId, status: MiniSettlementStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException(
        `Your handover is waiting for approval — you cannot ${action} a sale until your employer approves or rejects it`,
      );
    }
    const lastApproved = await this.settlementRepo.findOne({
      where: { miniId, status: MiniSettlementStatus.APPROVED },
      order: { approvedAt: 'DESC' },
    });
    if (lastApproved?.approvedAt && sale.date <= lastApproved.approvedAt) {
      throw new ConflictException(
        'This sale was already handed over — ask your employer to correct it',
      );
    }
  }

  /** True when two timestamps fall on the same calendar day (server local time). */
  private isSameCalendarDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  /**
   * Amend a sale recorded with the wrong quantity or price, the SAME DAY it was
   * made, by the person who made it. Modelled as void + re-record in one atomic
   * transaction: the original row(s) are rejected (stock restored, so every
   * `rejected_at IS NULL` figure drops them) and linked to the corrected row(s)
   * that replace them. Re-recording reuses the normal sale path, so stock
   * availability, SUPPLIER→CONSIGNED_IN→PERSONAL priority, carton splitting,
   * custody/mini rate stamps and the price-guard 422 all still apply — a 422 (or
   * any failure) rolls the whole thing back, leaving the original sale intact.
   *
   * A carton sale is amended as a unit (every row sharing its cartonSaleId). A
   * single-product sale that had split across lots is amended per row.
   */
  async amendSale(
    ctx: ActorContext,
    saleId: string,
    dto: AmendSaleDto,
  ): Promise<SaleTransaction> {
    const original = await this.saleRepo.findOne({ where: { id: saleId } });
    if (!original || !isOnMyBooks(original, ctx)) {
      throw new NotFoundException('Sale not found');
    }

    // Only the person who recorded it may amend it (owner sales: actorId null,
    // so the recorder is the owner themselves).
    const recorderId = original.actorId ?? original.ownerId;
    if (ctx.actorId !== recorderId) {
      throw new ForbiddenException(
        'Only the person who made this sale can amend it',
      );
    }

    if (original.rejectedAt) {
      throw new ConflictException(
        'This sale has already been rejected or amended',
      );
    }

    if (!this.isSameCalendarDay(original.date, new Date())) {
      throw new ConflictException(
        'A sale can only be amended on the day it was recorded',
      );
    }

    await this.assertMiniSaleNotSealed(ctx, original, 'amend');

    // The logical sale: a whole-carton sale is several rows sharing cartonSaleId.
    const originals = original.cartonSaleId
      ? await this.saleRepo.find({
          where: {
            ...holderScope(ctx),
            cartonSaleId: original.cartonSaleId,
            rejectedAt: IsNull(),
          },
        })
      : [original];

    const reason = dto.amendReason?.trim() || 'Amended';
    // The corrected sale. Drop the idempotency key: an amend is an explicit new
    // write, never a replay of the voided row.
    const corrected: RecordSaleDto = { ...dto, clientSaleId: undefined };

    return this.dataSource.transaction(async (manager) => {
      const now = new Date();

      // 1. Void each original row and put its stock back.
      for (const row of originals) {
        const fresh = await manager.findOne(SaleTransaction, {
          where: { id: row.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!fresh) throw new NotFoundException('Sale not found');
        if (fresh.rejectedAt) {
          throw new ConflictException(
            'This sale has already been rejected or amended',
          );
        }

        const entry = await manager.findOne(InventoryEntry, {
          where: { id: fresh.inventoryEntryId },
        });
        if (entry) {
          const qtyBefore = entry.quantityRemaining;
          entry.quantityRemaining += fresh.qtySold;
          await manager.save(InventoryEntry, entry);
          await this.stockMovements.record(manager, {
            ownerId: original.ownerId,
            entry,
            reason: StockMovementReason.SALE_REJECTED,
            qty: fresh.qtySold,
            qtyBefore,
            notes: reason,
            saleTransactionId: fresh.id,
          });
        }

        fresh.rejectedAt = now;
        fresh.rejectedById = ctx.actorId;
        fresh.rejectionReason = reason;
        fresh.amendedAt = now;
        await manager.save(SaleTransaction, fresh);
      }

      // 2. Re-record the corrected sale on the SAME transaction, so it sees the
      //    stock just restored and commits (or rolls back) atomically with it.
      const newSale = await this.recordSale(ctx, corrected, manager);

      // 3. Link the pair: new row → original, each voided original → new row.
      newSale.amendedFromId = original.id;
      await manager.save(SaleTransaction, newSale);
      for (const row of originals) {
        await manager.update(
          SaleTransaction,
          { id: row.id },
          { amendedToId: newSale.id },
        );
      }

      return newSale;
    });
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
    if (!isOnMyBooks(sale, ctx)) {
      throw new ForbiddenException('You cannot edit this sale');
    }

    const clientName = dto.clientName?.trim() || null;
    const clientPhone = dto.clientPhone?.trim() || null;

    // Group reprint: if this sale carries a receiptId, propagate the same
    // client info across every row in the receipt so a later search by
    // phone surfaces the whole transaction, not just one line.
    const targets = sale.receiptId
      ? await this.saleRepo.find({
          where: { ...holderScope(ctx), receiptId: sale.receiptId, rejectedAt: IsNull() },
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
      // A rejected line is off the receipt: reprinting it would hand the
      // customer a slip for goods that went back on the shelf.
      where: { ...holderScope(ctx), receiptId, rejectedAt: IsNull() },
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
      .where(...holderCond('sale', ctx))
      .andWhere('sale.rejected_at IS NULL')
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
      .where(...holderCond('sale', ctx))
      .andWhere('sale.rejected_at IS NULL');

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
