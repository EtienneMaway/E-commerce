import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  DebtorCredit,
  ExternalTransaction,
  InventoryEntry,
  InventorySource,
  NOTES_REQUIRED_REASONS,
  POSITIVE_REASONS,
  ProductGroup,
  ProductPrice,
  ProductVariant,
  SaleTransaction,
  StockMovement,
  StockMovementReason,
  SupplierDebt,
  User,
} from '../entities';
import { StockMovementsService } from '../stock-movements/stock-movements.service';

interface SourceBreakdown {
  personal: number;
  supplier: number;
  consignedIn: number;
  consignedOut: number;
}

/** One size of a sized product, with its live stock, inside a ProductSummary. */
export interface VariantSummary {
  variantId: string;
  label: string;
  unitCost: string;
  sellingPrice: string;
  piecesPerCarton: number;
  available: number;
  sourceBreakdown: SourceBreakdown;
  usdToFcRateSnapshot: string | null;
}

export interface ProductSummary {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  totalAvailable: number;
  sourceBreakdown: SourceBreakdown;
  latestSellingPrice: string;
  latestUnitCost: string;
  /** Locked FC/USD rate for a mini's consigned-in stock (null for owner/full
   *  stock). When set, the mini's app converts this product's prices to FC at
   *  this rate instead of the live one, keeping the agreement stable. */
  usdToFcRateSnapshot: string | null;
  /** Discriminates a normal flat-price product from a sized/carton group.
   *  Absent-safe: legacy consumers ignoring these fields keep working. */
  kind: 'simple' | 'group';
  /** Sized products only — the ProductGroup id. */
  groupId?: string;
  /** Sized products only — discounted whole-carton price (null disables carton selling). */
  cartonSellingPrice?: string | null;
  /** Sized products only — cost of one whole carton (null if not set). */
  cartonBuyingPrice?: string | null;
  /** Sized products only — min over sizes of floor(available / piecesPerCarton). */
  cartonsAvailable?: number;
  /** Sized products only — per-size breakdown. */
  variants?: VariantSummary[];
}

import { AddPersonalDto } from './dto/add-personal.dto';
import { AddPersonalBulkDto } from './dto/add-personal-bulk.dto';
import { ReceiveFromSupplierDto } from './dto/receive-from-supplier.dto';
import { ConsignToDebtorDto } from './dto/consign-to-debtor.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { UpdateSellingPriceDto } from './dto/update-selling-price.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { RenameProductDto } from './dto/rename-product.dto';
import type { EntityManager } from 'typeorm';

export interface RenameProductResult {
  oldName: string;
  newName: string;
  entriesUpdated: number;
  salesUpdated: number;
  externalTxUpdated: number;
  pricingUpdated: number;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SupplierDebt)
    private readonly supplierDebtRepo: Repository<SupplierDebt>,
    @InjectRepository(DebtorCredit)
    private readonly debtorCreditRepo: Repository<DebtorCredit>,
    @InjectRepository(ProductGroup)
    private readonly groupRepo: Repository<ProductGroup>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
  ) {}

  async findAll(
    ownerId: string,
    filter: InventoryFilterDto,
  ): Promise<{
    data: InventoryEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const where: Record<string, unknown> = { ownerId };
    if (filter.source) where.source = filter.source;
    if (filter.supplierUserId) where.supplierUserId = filter.supplierUserId;
    if (filter.category) where.category = ILike(`%${filter.category}%`);
    if (filter.productName)
      where.productName = ILike(filter.productName.trim().toLowerCase());

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;

    const [data, total] = await this.entryRepo.findAndCount({
      where,
      relations: { supplierUser: true, debtorUser: true },
      order: { createdAt: 'DESC' },
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

  async getProductList(ownerId: string): Promise<ProductSummary[]> {
    const entries = await this.entryRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });

    // Sized products (variant_id set) are grouped separately from simple ones so
    // their sizes don't collapse together under the shared group name.
    const simpleEntries = entries.filter((e) => e.variantId == null);
    const sizedEntries = entries.filter((e) => e.variantId != null);

    const summaries: ProductSummary[] = [];

    // ---- Simple products: one summary per product name (unchanged behavior) ----
    const productMap = new Map<string, InventoryEntry[]>();
    for (const entry of simpleEntries) {
      const existing = productMap.get(entry.productName) ?? [];
      existing.push(entry);
      productMap.set(entry.productName, existing);
    }

    for (const [productName, productEntries] of productMap) {
      const breakdown = this.sourceBreakdownOf(productEntries);
      const sellable = this.sellableOf(productEntries);

      const piecesPerCarton =
        productEntries.find((e) => e.piecesPerCarton !== null)
          ?.piecesPerCarton ?? null;
      const latestCartonPrice =
        productEntries.find((e) => e.cartonPrice !== null)?.cartonPrice ?? null;
      const category =
        productEntries.find((e) => e.category !== null)?.category ?? null;

      summaries.push({
        productName,
        category,
        piecesPerCarton,
        latestCartonPrice,
        totalAvailable:
          breakdown.personal + breakdown.supplier + breakdown.consignedIn,
        sourceBreakdown: breakdown,
        latestSellingPrice: sellable[0]?.sellingPrice ?? '0.0000',
        latestUnitCost: sellable[0]?.unitCost ?? '0.0000',
        usdToFcRateSnapshot:
          sellable.find((e) => e.usdToFcRateSnapshot != null)
            ?.usdToFcRateSnapshot ?? null,
        kind: 'simple',
      });
    }

    // ---- Sized products: one summary per group ----
    summaries.push(...(await this.groupSummaries(ownerId, sizedEntries)));

    return summaries;
  }

  private sourceBreakdownOf(entries: InventoryEntry[]): SourceBreakdown {
    return {
      personal: entries
        .filter((e) => e.source === InventorySource.PERSONAL)
        .reduce((s, e) => s + e.quantityRemaining, 0),
      supplier: entries
        .filter((e) => e.source === InventorySource.SUPPLIER)
        .reduce((s, e) => s + e.quantityRemaining, 0),
      consignedIn: entries
        .filter((e) => e.source === InventorySource.CONSIGNED_IN)
        .reduce((s, e) => s + e.quantityRemaining, 0),
      consignedOut: entries
        .filter((e) => e.source === InventorySource.CONSIGNED_OUT)
        .reduce((s, e) => s + e.quantityRemaining, 0),
    };
  }

  /** Sellable lots (PERSONAL, SUPPLIER, CONSIGNED_IN), keeping the input order. */
  private sellableOf(entries: InventoryEntry[]): InventoryEntry[] {
    return entries.filter(
      (e) =>
        e.source === InventorySource.PERSONAL ||
        e.source === InventorySource.SUPPLIER ||
        e.source === InventorySource.CONSIGNED_IN,
    );
  }

  /**
   * Build one ProductSummary per sized-product group. Groups are resolved both
   * from the viewer's own catalog (so freshly-created empty groups still show)
   * and from any group referenced by consigned-in stock (whose group/variant
   * rows live on the owner's books, not the mini's).
   */
  private async groupSummaries(
    ownerId: string,
    sizedEntries: InventoryEntry[],
  ): Promise<ProductSummary[]> {
    const ownGroups = await this.groupRepo.find({
      where: { ownerId, archived: false },
      relations: { variants: true },
      order: { createdAt: 'DESC' },
    });

    const ownGroupIds = new Set(ownGroups.map((g) => g.id));
    const referencedGroupIds = [
      ...new Set(
        sizedEntries
          .map((e) => e.groupId)
          .filter((id): id is string => id != null),
      ),
    ].filter((id) => !ownGroupIds.has(id));

    const extraGroups = referencedGroupIds.length
      ? await this.groupRepo.find({
          where: { id: In(referencedGroupIds) },
          relations: { variants: true },
        })
      : [];

    const allGroups = [...ownGroups, ...extraGroups];
    if (allGroups.length === 0) return [];

    const entriesByVariant = new Map<string, InventoryEntry[]>();
    for (const e of sizedEntries) {
      if (!e.variantId) continue;
      const list = entriesByVariant.get(e.variantId) ?? [];
      list.push(e);
      entriesByVariant.set(e.variantId, list);
    }

    const summaries: ProductSummary[] = [];
    for (const group of allGroups) {
      const variants: VariantSummary[] = (group.variants ?? [])
        .filter((v) => !v.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((v) => {
          const vEntries = entriesByVariant.get(v.id) ?? [];
          const breakdown = this.sourceBreakdownOf(vEntries);
          const sellable = this.sellableOf(vEntries);
          return {
            variantId: v.id,
            label: v.label,
            // Prefer the live lot's price (the mini's agreed price / latest cost);
            // fall back to the size's standard price when no stock exists yet.
            unitCost: sellable[0]?.unitCost ?? v.unitCost ?? '0.0000',
            sellingPrice: sellable[0]?.sellingPrice ?? v.sellingPrice,
            piecesPerCarton: v.piecesPerCarton,
            available:
              breakdown.personal + breakdown.supplier + breakdown.consignedIn,
            sourceBreakdown: breakdown,
            usdToFcRateSnapshot:
              sellable.find((e) => e.usdToFcRateSnapshot != null)
                ?.usdToFcRateSnapshot ?? null,
          };
        });

      const cartonGating = variants.filter((v) => v.piecesPerCarton > 0);
      const cartonsAvailable =
        cartonGating.length === 0
          ? 0
          : Math.min(
              ...cartonGating.map((v) =>
                Math.floor(v.available / v.piecesPerCarton),
              ),
            );

      const aggregate: SourceBreakdown = variants.reduce(
        (acc, v) => ({
          personal: acc.personal + v.sourceBreakdown.personal,
          supplier: acc.supplier + v.sourceBreakdown.supplier,
          consignedIn: acc.consignedIn + v.sourceBreakdown.consignedIn,
          consignedOut: acc.consignedOut + v.sourceBreakdown.consignedOut,
        }),
        { personal: 0, supplier: 0, consignedIn: 0, consignedOut: 0 },
      );

      summaries.push({
        productName: group.name,
        category: group.category,
        piecesPerCarton: null,
        latestCartonPrice: null,
        totalAvailable: variants.reduce((s, v) => s + v.available, 0),
        sourceBreakdown: aggregate,
        latestSellingPrice: variants[0]?.sellingPrice ?? '0.0000',
        latestUnitCost: variants[0]?.unitCost ?? '0.0000',
        usdToFcRateSnapshot:
          variants.find((v) => v.usdToFcRateSnapshot != null)
            ?.usdToFcRateSnapshot ?? null,
        kind: 'group',
        groupId: group.id,
        // A mini's own carton price (set on their consigned lots) overrides the
        // owner's group carton price when present.
        cartonSellingPrice:
          sizedEntries.find((e) => e.groupId === group.id && e.cartonPrice != null)?.cartonPrice ??
          group.cartonSellingPrice,
        cartonBuyingPrice: group.cartonBuyingPrice,
        cartonsAvailable,
        variants,
      });
    }

    return summaries;
  }

  async addPersonal(
    ownerId: string,
    dto: AddPersonalDto,
  ): Promise<InventoryEntry> {
    return this.dataSource.transaction((manager) =>
      this.addPersonalInTx(manager, ownerId, dto),
    );
  }

  async addPersonalBulk(
    ownerId: string,
    dto: AddPersonalBulkDto,
  ): Promise<InventoryEntry[]> {
    return this.dataSource.transaction(async (manager) => {
      const results: InventoryEntry[] = [];
      for (const item of dto.items) {
        results.push(await this.addPersonalInTx(manager, ownerId, item));
      }
      return results;
    });
  }

  /**
   * Reject creating simple (flat-price) stock under a name already used by a
   * sized/composite product — those are restocked through the sized-product
   * form, not this one. Keeps the two product shapes from colliding on a name.
   */
  private async assertNotSizedName(
    manager: EntityManager,
    ownerId: string,
    name: string,
  ): Promise<void> {
    const group = await manager.findOne(ProductGroup, {
      where: { ownerId, name: ILike(name) },
    });
    if (group) {
      throw new ConflictException(
        `A sized product named "${name}" already exists. Add stock from the sized-product form instead.`,
      );
    }
  }

  private async addPersonalInTx(
    manager: EntityManager,
    ownerId: string,
    dto: AddPersonalDto,
  ): Promise<InventoryEntry> {
    const normalizedName = dto.productName.trim().toLowerCase();
    await this.assertNotSizedName(manager, ownerId, normalizedName);

    const existing = await manager.findOne(InventoryEntry, {
      where: {
        ownerId,
        source: InventorySource.PERSONAL,
        productName: ILike(normalizedName),
      },
    });

    let saved: InventoryEntry;
    let qtyBefore: number;

    if (existing) {
      qtyBefore = existing.quantityRemaining;
      existing.quantityOriginal += dto.quantity;
      existing.quantityRemaining += dto.quantity;
      existing.unitCost = dto.unitCost;
      existing.sellingPrice = dto.sellingPrice;
      if (dto.cartonPrice !== undefined) existing.cartonPrice = dto.cartonPrice;
      if (dto.piecesPerCarton !== undefined)
        existing.piecesPerCarton = dto.piecesPerCarton;
      saved = await manager.save(InventoryEntry, existing);
    } else {
      qtyBefore = 0;
      const entry = manager.create(InventoryEntry, {
        ownerId,
        source: InventorySource.PERSONAL,
        productName: normalizedName,
        unitCost: dto.unitCost,
        sellingPrice: dto.sellingPrice,
        category: dto.category ?? null,
        quantityOriginal: dto.quantity,
        quantityRemaining: dto.quantity,
        cartonPrice: dto.cartonPrice ?? null,
        piecesPerCarton: dto.piecesPerCarton ?? null,
      });
      saved = await manager.save(InventoryEntry, entry);
    }

    await this.stockMovements.record(manager, {
      ownerId,
      entry: saved,
      reason: StockMovementReason.PURCHASE,
      qty: dto.quantity,
      qtyBefore,
    });

    return saved;
  }

  async receiveFromSupplier(
    ownerId: string,
    dto: ReceiveFromSupplierDto,
  ): Promise<InventoryEntry> {
    const supplier = await this.userRepo.findOne({
      where: { id: dto.supplierUserId },
    });
    if (!supplier) throw new NotFoundException('Supplier user not found');
    if (supplier.id === ownerId) {
      throw new BadRequestException('You cannot be your own supplier');
    }

    return this.dataSource.transaction(async (manager) => {
      const normalizedName = dto.productName.trim().toLowerCase();
      await this.assertNotSizedName(manager, ownerId, normalizedName);

      // Upsert: top up existing SUPPLIER entry for same product + supplier
      const existing = await manager.findOne(InventoryEntry, {
        where: {
          ownerId,
          source: InventorySource.SUPPLIER,
          supplierUserId: dto.supplierUserId,
          productName: ILike(normalizedName),
        },
      });

      let savedEntry: InventoryEntry;
      let qtyBefore: number;

      if (existing) {
        qtyBefore = existing.quantityRemaining;
        existing.quantityOriginal += dto.quantity;
        existing.quantityRemaining += dto.quantity;
        existing.unitCost = dto.unitCost;
        existing.sellingPrice = dto.sellingPrice;
        if (dto.cartonPrice !== undefined)
          existing.cartonPrice = dto.cartonPrice;
        if (dto.piecesPerCarton !== undefined)
          existing.piecesPerCarton = dto.piecesPerCarton;
        savedEntry = await manager.save(InventoryEntry, existing);
      } else {
        qtyBefore = 0;
        // Create inventory entry
        const entry = manager.create(InventoryEntry, {
          ownerId,
          source: InventorySource.SUPPLIER,
          productName: normalizedName,
          unitCost: dto.unitCost,
          sellingPrice: dto.sellingPrice,
          category: dto.category ?? null,
          quantityOriginal: dto.quantity,
          quantityRemaining: dto.quantity,
          supplierUserId: dto.supplierUserId,
          cartonPrice: dto.cartonPrice ?? null,
          piecesPerCarton: dto.piecesPerCarton ?? null,
        });
        savedEntry = await manager.save(InventoryEntry, entry);
      }

      // Upsert SupplierDebt
      const creditValue = new Decimal(dto.unitCost)
        .mul(dto.quantity)
        .toFixed(4);

      let debt = await manager.findOne(SupplierDebt, {
        where: { ownerId, supplierUserId: dto.supplierUserId },
      });

      if (!debt) {
        debt = manager.create(SupplierDebt, {
          ownerId,
          supplierUserId: dto.supplierUserId,
          totalCreditReceived: creditValue,
          totalPaid: '0.0000',
          outstandingBalance: creditValue,
        });
      } else {
        debt.totalCreditReceived = new Decimal(debt.totalCreditReceived)
          .plus(creditValue)
          .toFixed(4);
        debt.outstandingBalance = new Decimal(debt.outstandingBalance)
          .plus(creditValue)
          .toFixed(4);
      }

      const savedDebt = await manager.save(SupplierDebt, debt);

      // Link entry to debt
      savedEntry.supplierDebtId = savedDebt.id;
      await manager.save(InventoryEntry, savedEntry);

      await this.stockMovements.record(manager, {
        ownerId,
        entry: savedEntry,
        reason: StockMovementReason.RECEIVE_SUPPLIER,
        qty: dto.quantity,
        qtyBefore,
        supplierDebtId: savedDebt.id,
      });

      return savedEntry;
    });
  }

  async consignToDebtor(
    ownerId: string,
    dto: ConsignToDebtorDto,
  ): Promise<InventoryEntry> {
    const debtor = await this.userRepo.findOne({
      where: { id: dto.debtorUserId },
    });
    if (!debtor) throw new NotFoundException('Debtor user not found');
    if (debtor.id === ownerId) {
      throw new BadRequestException('You cannot consign to yourself');
    }

    return this.dataSource.transaction(async (manager) => {
      // Find available stock for this product (SUPPLIER first, then PERSONAL)
      const availableEntries = await manager.find(InventoryEntry, {
        where: [
          {
            ownerId,
            productName: ILike(dto.productName.trim().toLowerCase()),
            source: InventorySource.SUPPLIER,
          },
          {
            ownerId,
            productName: ILike(dto.productName.trim().toLowerCase()),
            source: InventorySource.PERSONAL,
          },
        ],
        order: { createdAt: 'ASC' },
      });

      // SUPPLIER stock must be deducted before PERSONAL (PRD rule 4.2.2)
      const sorted = [
        ...availableEntries.filter(
          (e) => e.source === InventorySource.SUPPLIER,
        ),
        ...availableEntries.filter(
          (e) => e.source === InventorySource.PERSONAL,
        ),
      ].filter((e) => e.quantityRemaining > 0);

      const totalAvailable = sorted.reduce(
        (sum, e) => sum + e.quantityRemaining,
        0,
      );
      if (totalAvailable < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${totalAvailable}, requested: ${dto.quantity}`,
        );
      }

      // Deduct from source entries — emit one CONSIGN_OUT movement per source lot
      let remaining = dto.quantity;
      for (const entry of sorted) {
        if (remaining === 0) break;
        const deduct = Math.min(entry.quantityRemaining, remaining);
        const qtyBeforeDeduct = entry.quantityRemaining;
        entry.quantityRemaining -= deduct;
        remaining -= deduct;
        await manager.save(InventoryEntry, entry);

        await this.stockMovements.record(manager, {
          ownerId,
          entry,
          reason: StockMovementReason.CONSIGN_OUT,
          qty: deduct,
          qtyBefore: qtyBeforeDeduct,
        });
      }

      // Determine unitCost from the stock that was deducted (use first matching entry's cost)
      const sourceCost = sorted[0]?.unitCost ?? dto.agreedUnitPrice;

      // Create consigned-out entry (inherit cartonPrice and piecesPerCarton from source stock)
      const consignedEntry = manager.create(InventoryEntry, {
        ownerId,
        source: InventorySource.CONSIGNED_OUT,
        productName: dto.productName.trim().toLowerCase(),
        unitCost: sourceCost,
        sellingPrice: dto.agreedUnitPrice,
        category: dto.category ?? null,
        quantityOriginal: dto.quantity,
        quantityRemaining: dto.quantity,
        debtorUserId: dto.debtorUserId,
        cartonPrice: sorted[0]?.cartonPrice ?? null,
        piecesPerCarton: sorted[0]?.piecesPerCarton ?? null,
      });
      const savedEntry = await manager.save(InventoryEntry, consignedEntry);

      // Upsert DebtorCredit
      const creditValue = new Decimal(dto.agreedUnitPrice)
        .mul(dto.quantity)
        .toFixed(4);

      let credit = await manager.findOne(DebtorCredit, {
        where: { ownerId, debtorUserId: dto.debtorUserId },
      });

      if (!credit) {
        credit = manager.create(DebtorCredit, {
          ownerId,
          debtorUserId: dto.debtorUserId,
          totalCreditGiven: creditValue,
          totalReceived: '0.0000',
          outstandingBalance: creditValue,
        });
      } else {
        credit.totalCreditGiven = new Decimal(credit.totalCreditGiven)
          .plus(creditValue)
          .toFixed(4);
        credit.outstandingBalance = new Decimal(credit.outstandingBalance)
          .plus(creditValue)
          .toFixed(4);
      }

      const savedCredit = await manager.save(DebtorCredit, credit);

      // Link entry to credit
      savedEntry.debtorCreditId = savedCredit.id;
      await manager.save(InventoryEntry, savedEntry);

      return savedEntry;
    });
  }

  async renameProduct(
    ownerId: string,
    currentName: string,
    dto: RenameProductDto,
  ): Promise<RenameProductResult> {
    const oldNorm = currentName.trim().toLowerCase();
    const newNorm = dto.newName.trim().toLowerCase();

    if (!oldNorm)
      throw new BadRequestException('Current product name is required');
    if (!newNorm) throw new BadRequestException('New product name is required');

    if (oldNorm === newNorm) {
      return {
        oldName: oldNorm,
        newName: newNorm,
        entriesUpdated: 0,
        salesUpdated: 0,
        externalTxUpdated: 0,
        pricingUpdated: 0,
      };
    }

    return this.dataSource.transaction(async (manager) => {
      // Block when ACTIVE consignment-linked stock exists. Settled consignment
      // rows (quantityRemaining = 0) stay under their original name on both
      // sides — historical paper trail — but don't prevent renaming the
      // owner-controlled lots forward.
      const activeConsigned = await manager
        .createQueryBuilder(InventoryEntry, 'e')
        .where('e.owner_id = :ownerId', { ownerId })
        .andWhere('LOWER(e.product_name) = :name', { name: oldNorm })
        .andWhere('e.source IN (:...sources)', {
          sources: [
            InventorySource.CONSIGNED_IN,
            InventorySource.CONSIGNED_OUT,
          ],
        })
        .andWhere('e.quantity_remaining > 0')
        .getCount();
      if (activeConsigned > 0) {
        throw new BadRequestException(
          'Cannot rename while there is active consigned-in or consigned-out stock for this product. Settle those consignments first.',
        );
      }

      const ownedCount = await manager.count(InventoryEntry, {
        where: [
          {
            ownerId,
            productName: ILike(oldNorm),
            source: InventorySource.PERSONAL,
          },
          {
            ownerId,
            productName: ILike(oldNorm),
            source: InventorySource.SUPPLIER,
          },
        ],
      });
      if (ownedCount === 0) {
        throw new NotFoundException(
          `No PERSONAL or SUPPLIER stock found for product "${currentName}"`,
        );
      }

      const conflict = await manager.count(InventoryEntry, {
        where: { ownerId, productName: ILike(newNorm) },
      });
      if (conflict > 0) {
        throw new ConflictException(
          `Another product already uses the name "${dto.newName}". Choose a different name or merge manually.`,
        );
      }

      const entriesResult = await manager
        .createQueryBuilder()
        .update(InventoryEntry)
        .set({ productName: newNorm })
        .where('owner_id = :ownerId', { ownerId })
        .andWhere('LOWER(product_name) = :name', { name: oldNorm })
        .andWhere('source IN (:...sources)', {
          sources: [InventorySource.PERSONAL, InventorySource.SUPPLIER],
        })
        .execute();

      const salesResult = await manager
        .createQueryBuilder()
        .update(SaleTransaction)
        .set({ productName: newNorm })
        .where('owner_id = :ownerId', { ownerId })
        .andWhere('LOWER(product_name) = :name', { name: oldNorm })
        .execute();

      const externalResult = await manager
        .createQueryBuilder()
        .update(ExternalTransaction)
        .set({ productName: newNorm })
        .where('owner_id = :ownerId', { ownerId })
        .andWhere('LOWER(product_name) = :name', { name: oldNorm })
        .execute();

      const pricingResult = await manager
        .createQueryBuilder()
        .update(ProductPrice)
        .set({ productName: newNorm })
        .where('owner_id = :ownerId', { ownerId })
        .andWhere('LOWER(product_name) = :name', { name: oldNorm })
        .execute();

      return {
        oldName: oldNorm,
        newName: newNorm,
        entriesUpdated: entriesResult.affected ?? 0,
        salesUpdated: salesResult.affected ?? 0,
        externalTxUpdated: externalResult.affected ?? 0,
        pricingUpdated: pricingResult.affected ?? 0,
      };
    });
  }

  async updateSellingPrice(
    ownerId: string,
    entryId: string,
    dto: UpdateSellingPriceDto,
  ): Promise<InventoryEntry> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Inventory entry not found');
    if (entry.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this inventory entry');
    if (entry.source === InventorySource.CONSIGNED_OUT) {
      throw new BadRequestException(
        'Selling price cannot be updated on CONSIGNED_OUT entries',
      );
    }

    entry.sellingPrice = dto.sellingPrice;
    return this.entryRepo.save(entry);
  }

  /**
   * Mini-employee raises the selling price on their OWN consigned-in stock.
   * They may price at or above the agreed price they owe (unitCost) — never
   * below, since the markup above the agreed price is the mini's profit and
   * pricing below it would guarantee them a loss on goods they must still pay for.
   */
  async updateMiniSellingPrice(
    miniId: string,
    entryId: string,
    dto: UpdateSellingPriceDto,
  ): Promise<InventoryEntry> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Inventory entry not found');
    if (entry.ownerId !== miniId)
      throw new ForbiddenException('You do not own this inventory entry');
    if (entry.source !== InventorySource.CONSIGNED_IN) {
      throw new BadRequestException(
        'Mini employees can only re-price their consigned-in stock',
      );
    }
    if (new Decimal(dto.sellingPrice).lt(entry.unitCost)) {
      throw new BadRequestException(
        `Selling price cannot be below the agreed price you owe (${entry.unitCost})`,
      );
    }

    entry.sellingPrice = new Decimal(dto.sellingPrice).toFixed(4);
    return this.entryRepo.save(entry);
  }

  /**
   * Mini-employee sets the price they will sell a WHOLE carton of a sized product
   * for. Stored on their CONSIGNED_IN lots (the legacy `cartonPrice` column, unused
   * for sized consigned stock) so the read model can surface it and the sell modal
   * defaults to it. The per-lot floor (what they owe) is enforced by the sale guard.
   */
  async updateMiniCartonPrice(
    miniId: string,
    groupId: string,
    cartonSellingPrice: string,
  ): Promise<{ updated: number }> {
    const price = new Decimal(cartonSellingPrice);
    if (price.lte(0)) {
      throw new BadRequestException('Carton price must be greater than zero');
    }
    const result = await this.entryRepo
      .createQueryBuilder()
      .update(InventoryEntry)
      .set({ cartonPrice: price.toFixed(4) })
      .where('owner_id = :miniId', { miniId })
      .andWhere('group_id = :groupId', { groupId })
      .andWhere('source = :source', { source: InventorySource.CONSIGNED_IN })
      .execute();
    if (!result.affected) {
      throw new NotFoundException('No consigned stock for this product');
    }
    return { updated: result.affected };
  }

  async adjustStock(
    ownerId: string,
    entryId: string,
    dto: AdjustStockDto,
  ): Promise<{ entry: InventoryEntry; movement: StockMovement }> {
    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.findOne(InventoryEntry, {
        where: { id: entryId },
      });
      if (!entry) throw new NotFoundException('Inventory entry not found');
      if (entry.ownerId !== ownerId) {
        throw new ForbiddenException('You do not own this inventory entry');
      }

      // CONSIGNED_OUT is owned by the debtor lifecycle — owners cannot adjust it manually.
      if (entry.source === InventorySource.CONSIGNED_OUT) {
        throw new BadRequestException(
          'Cannot manually adjust CONSIGNED_OUT entries — they are managed by consignment lifecycle',
        );
      }

      const reason = dto.reason as unknown as StockMovementReason;
      const sign = POSITIVE_REASONS.has(reason) ? 1 : -1;
      const signedDelta = sign * dto.qty;

      // Notes-required reasons
      if (
        NOTES_REQUIRED_REASONS.has(reason) &&
        (!dto.notes || dto.notes.trim() === '')
      ) {
        throw new BadRequestException(
          `Notes are required for reason ${reason}`,
        );
      }

      const qtyBefore = entry.quantityRemaining;
      const qtyAfter = qtyBefore + signedDelta;
      if (qtyAfter < 0) {
        throw new BadRequestException(
          `Insufficient stock to adjust. Current: ${qtyBefore}, requested delta: ${signedDelta}`,
        );
      }

      // Special-case: SUPPLIER_RETURN reduces supplier debt
      let supplierDebtId: string | null = null;
      if (reason === StockMovementReason.SUPPLIER_RETURN) {
        if (
          entry.source !== InventorySource.SUPPLIER ||
          !entry.supplierDebtId
        ) {
          throw new BadRequestException(
            'Only supplier-sourced stock can be returned to a supplier',
          );
        }
        const debt = await manager.findOne(SupplierDebt, {
          where: { id: entry.supplierDebtId },
        });
        if (!debt) {
          throw new BadRequestException('Linked supplier debt not found');
        }
        const valueReturned = new Decimal(entry.unitCost).mul(dto.qty);
        const newCredit = new Decimal(debt.totalCreditReceived).minus(
          valueReturned,
        );
        const newOutstanding = new Decimal(debt.outstandingBalance).minus(
          valueReturned,
        );
        if (newOutstanding.lt(0)) {
          throw new BadRequestException(
            'Returned value exceeds outstanding debt — record a refund instead',
          );
        }
        debt.totalCreditReceived = newCredit.toFixed(4);
        debt.outstandingBalance = newOutstanding.toFixed(4);
        await manager.save(SupplierDebt, debt);
        supplierDebtId = debt.id;
      }

      entry.quantityRemaining = qtyAfter;
      // Note: quantityOriginal is intentionally left untouched (historical "received" count).
      const savedEntry = await manager.save(InventoryEntry, entry);

      const movement = await this.stockMovements.record(manager, {
        ownerId,
        entry: savedEntry,
        reason,
        qty: dto.qty,
        qtyBefore,
        notes: dto.notes ?? null,
        supplierDebtId,
      });

      return { entry: savedEntry, movement };
    });
  }

  /**
   * Adjust stock for one size of a sized product. Finds the owner's own lot for
   * that variant (PERSONAL preferred, else SUPPLIER) and applies the same typed
   * adjustment as a simple product.
   */
  async adjustVariantStock(
    ownerId: string,
    variantId: string,
    dto: AdjustStockDto,
  ): Promise<{ entry: InventoryEntry; movement: StockMovement }> {
    const entry = await this.entryRepo.findOne({
      where: [
        { ownerId, variantId, source: InventorySource.PERSONAL },
        { ownerId, variantId, source: InventorySource.SUPPLIER },
      ],
      order: { createdAt: 'DESC' },
    });
    if (!entry) {
      throw new NotFoundException('No adjustable stock for this size');
    }
    return this.adjustStock(ownerId, entry.id, dto);
  }
}
