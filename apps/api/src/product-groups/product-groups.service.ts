import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, IsNull, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
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
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { AddGroupStockDto } from './dto/add-group-stock.dto';

export interface RenameGroupResult {
  oldName: string;
  newName: string;
  entriesUpdated: number;
  salesUpdated: number;
}

/** A variant plus its live stock availability, for read endpoints. */
export interface VariantWithAvailability {
  id: string;
  label: string;
  /** Per-piece cost — null when only the carton buying price is set. */
  unitCost: string | null;
  sellingPrice: string;
  piecesPerCarton: number;
  sortOrder: number;
  available: number;
}

/** A group plus its variants and derived carton availability, for read endpoints. */
export interface GroupWithAvailability {
  id: string;
  name: string;
  category: string | null;
  cartonSellingPrice: string | null;
  cartonBuyingPrice: string | null;
  archived: boolean;
  variants: VariantWithAvailability[];
  /** min over sizes of floor(available / piecesPerCarton); 0 if any size lacks a full set. */
  cartonsAvailable: number;
  /** total sellable pieces across all sizes. */
  totalPieces: number;
}

@Injectable()
export class ProductGroupsService {
  constructor(
    @InjectRepository(ProductGroup)
    private readonly groupRepo: Repository<ProductGroup>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
  ) {}

  /** The carton must sell for more than it costs. */
  private assertCartonPricing(
    sellingPrice: string | null | undefined,
    buyingPrice: string | null | undefined,
  ): void {
    if (sellingPrice != null && buyingPrice != null) {
      if (new Decimal(sellingPrice).lte(new Decimal(buyingPrice))) {
        throw new BadRequestException(
          'Carton selling price must be higher than the carton buying price',
        );
      }
    }
  }

  /**
   * Per-piece cost for a size: its own cost if set, else the carton buying price
   * split across sizes by selling-price share, else 0.
   */
  private deriveSizeCost(
    cartonBuyingPrice: string | null,
    variant: { unitCost: string | null; sellingPrice: string },
    allVariants: { sellingPrice: string; piecesPerCarton: number }[],
  ): string {
    if (variant.unitCost != null) return new Decimal(variant.unitCost).toFixed(4);
    if (cartonBuyingPrice == null) return '0.0000';
    const total = allVariants.reduce(
      (s, v) => s.plus(new Decimal(v.sellingPrice).mul(v.piecesPerCarton)),
      new Decimal(0),
    );
    if (total.lte(0)) return '0.0000';
    return new Decimal(cartonBuyingPrice)
      .mul(variant.sellingPrice)
      .div(total)
      .toFixed(4);
  }

  // --------------------------------------------------------------- create

  async createGroup(
    ownerId: string,
    dto: CreateProductGroupDto,
  ): Promise<ProductGroup> {
    const name = dto.name.trim().toLowerCase();

    // Variant labels must be unique within the submitted set.
    const labels = dto.variants.map((v) => v.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      throw new BadRequestException('Duplicate size labels in the group');
    }
    this.assertCartonPricing(dto.cartonSellingPrice, dto.cartonBuyingPrice);

    return this.dataSource.transaction(async (manager) => {
      await this.assertNameFree(manager, ownerId, name);

      const group = manager.create(ProductGroup, {
        ownerId,
        name,
        category: dto.category ?? null,
        cartonSellingPrice: dto.cartonSellingPrice ?? null,
        cartonBuyingPrice: dto.cartonBuyingPrice ?? null,
        archived: false,
      });
      const savedGroup = await manager.save(ProductGroup, group);

      const variants = dto.variants.map((v, i) =>
        manager.create(ProductVariant, {
          groupId: savedGroup.id,
          ownerId,
          label: v.label.trim().toLowerCase(),
          // Cost is optional — normally derived from the carton buying price.
          unitCost: v.unitCost != null ? new Decimal(v.unitCost).toFixed(4) : null,
          sellingPrice: new Decimal(v.sellingPrice).toFixed(4),
          piecesPerCarton: v.piecesPerCarton ?? 1,
          sortOrder: v.sortOrder ?? i,
          archived: false,
        }),
      );
      savedGroup.variants = await manager.save(ProductVariant, variants);
      return savedGroup;
    });
  }

  // ----------------------------------------------------------------- read

  async listGroups(ownerId: string): Promise<GroupWithAvailability[]> {
    const groups = await this.groupRepo.find({
      where: { ownerId, archived: false },
      relations: { variants: true },
      order: { createdAt: 'DESC' },
    });
    if (groups.length === 0) return [];

    const variantIds = groups.flatMap((g) =>
      (g.variants ?? []).map((v) => v.id),
    );
    const availability = await this.availabilityByVariant(ownerId, variantIds);

    return groups.map((g) => this.toSummary(g, availability));
  }

  async getGroup(ownerId: string, id: string): Promise<GroupWithAvailability> {
    const group = await this.groupRepo.findOne({
      where: { id, ownerId },
      relations: { variants: true },
    });
    if (!group) throw new NotFoundException('Product group not found');

    const variantIds = (group.variants ?? []).map((v) => v.id);
    const availability = await this.availabilityByVariant(ownerId, variantIds);
    return this.toSummary(group, availability);
  }

  // --------------------------------------------------------------- update

  async updateGroup(
    ownerId: string,
    id: string,
    dto: UpdateProductGroupDto,
  ): Promise<ProductGroup> {
    const group = await this.groupRepo.findOne({ where: { id, ownerId } });
    if (!group) throw new NotFoundException('Product group not found');

    if (dto.category !== undefined) group.category = dto.category;
    if (dto.cartonSellingPrice !== undefined) {
      group.cartonSellingPrice = new Decimal(dto.cartonSellingPrice).toFixed(4);
    }
    if (dto.cartonBuyingPrice !== undefined) {
      group.cartonBuyingPrice = new Decimal(dto.cartonBuyingPrice).toFixed(4);
    }
    // Validate against the resulting (merged) values.
    this.assertCartonPricing(group.cartonSellingPrice, group.cartonBuyingPrice);
    if (dto.archived !== undefined) group.archived = dto.archived;

    return this.groupRepo.save(group);
  }

  /**
   * Rename a group, cascading the new name across the owner's PERSONAL/SUPPLIER
   * inventory lots and their sale rows (by variant), in one atomic transaction.
   * Mirrors inventory.renameProduct: blocked while active consigned stock for the
   * group exists (names must stay in sync with the mini's records).
   */
  async renameGroup(ownerId: string, id: string, newNameRaw: string): Promise<RenameGroupResult> {
    const group = await this.groupRepo.findOne({ where: { id, ownerId }, relations: { variants: true } });
    if (!group) throw new NotFoundException('Product group not found');

    const newName = newNameRaw.trim().toLowerCase();
    const oldName = group.name;
    if (!newName) throw new BadRequestException('New product name is required');
    if (newName === oldName) {
      return { oldName, newName, entriesUpdated: 0, salesUpdated: 0 };
    }

    return this.dataSource.transaction(async (manager) => {
      const activeConsigned = await manager
        .createQueryBuilder(InventoryEntry, 'e')
        .where('e.group_id = :id', { id })
        .andWhere('e.source IN (:...sources)', {
          sources: [InventorySource.CONSIGNED_IN, InventorySource.CONSIGNED_OUT],
        })
        .andWhere('e.quantity_remaining > 0')
        .getCount();
      if (activeConsigned > 0) {
        throw new BadRequestException(
          'Group rename is not supported while there is active consigned stock. Settle those consignments first.',
        );
      }

      const groupClash = await manager.findOne(ProductGroup, {
        where: { ownerId, name: ILike(newName) },
      });
      if (groupClash && groupClash.id !== id) {
        throw new ConflictException(
          `Another product already uses the name "${newName}". Choose a different name.`,
        );
      }
      const entryClash = await manager.findOne(InventoryEntry, {
        where: { ownerId, productName: ILike(newName), variantId: IsNull() },
      });
      if (entryClash) {
        throw new ConflictException(
          `Another product already uses the name "${newName}". Choose a different name.`,
        );
      }

      group.name = newName;
      await manager.save(ProductGroup, group);

      const entriesResult = await manager
        .createQueryBuilder()
        .update(InventoryEntry)
        .set({ productName: newName })
        .where('owner_id = :ownerId', { ownerId })
        .andWhere('group_id = :id', { id })
        .andWhere('source IN (:...sources)', {
          sources: [InventorySource.PERSONAL, InventorySource.SUPPLIER],
        })
        .execute();

      const variantIds = (group.variants ?? []).map((v) => v.id);
      let salesUpdated = 0;
      if (variantIds.length > 0) {
        const salesResult = await manager
          .createQueryBuilder()
          .update(SaleTransaction)
          .set({ productName: newName })
          .where('owner_id = :ownerId', { ownerId })
          .andWhere('variant_id IN (:...variantIds)', { variantIds })
          .execute();
        salesUpdated = salesResult.affected ?? 0;
      }

      return {
        oldName,
        newName,
        entriesUpdated: entriesResult.affected ?? 0,
        salesUpdated,
      };
    });
  }

  // -------------------------------------------------------------- variants

  async addVariant(
    ownerId: string,
    groupId: string,
    dto: CreateVariantDto,
  ): Promise<ProductVariant> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, ownerId },
    });
    if (!group) throw new NotFoundException('Product group not found');

    const label = dto.label.trim().toLowerCase();
    const clash = await this.variantRepo.findOne({
      where: { groupId, label: ILike(label) },
    });
    if (clash)
      throw new ConflictException(
        `Size "${dto.label}" already exists in this group`,
      );

    const variant = this.variantRepo.create({
      groupId,
      ownerId,
      label,
      unitCost: dto.unitCost != null ? new Decimal(dto.unitCost).toFixed(4) : null,
      sellingPrice: new Decimal(dto.sellingPrice).toFixed(4),
      piecesPerCarton: dto.piecesPerCarton ?? 1,
      sortOrder: dto.sortOrder ?? 0,
      archived: false,
    });
    return this.variantRepo.save(variant);
  }

  async updateVariant(
    ownerId: string,
    groupId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, groupId, ownerId },
    });
    if (!variant) throw new NotFoundException('Size not found');

    if (dto.label !== undefined) {
      const label = dto.label.trim().toLowerCase();
      if (label !== variant.label) {
        const clash = await this.variantRepo.findOne({
          where: { groupId, label: ILike(label) },
        });
        if (clash)
          throw new ConflictException(
            `Size "${dto.label}" already exists in this group`,
          );
      }
      variant.label = label;
    }
    if (dto.unitCost !== undefined)
      variant.unitCost = new Decimal(dto.unitCost).toFixed(4);
    if (dto.sellingPrice !== undefined)
      variant.sellingPrice = new Decimal(dto.sellingPrice).toFixed(4);
    if (dto.piecesPerCarton !== undefined)
      variant.piecesPerCarton = dto.piecesPerCarton;
    if (dto.sortOrder !== undefined) variant.sortOrder = dto.sortOrder;
    if (dto.archived !== undefined) variant.archived = dto.archived;

    const saved = await this.variantRepo.save(variant);

    // A new selling price cascades to the owner's own live lots so the change
    // takes effect immediately (the read model prefers the lot price). Consigned
    // lots keep their agreed price.
    if (dto.sellingPrice !== undefined) {
      await this.entryRepo
        .createQueryBuilder()
        .update(InventoryEntry)
        .set({ sellingPrice: new Decimal(dto.sellingPrice).toFixed(4) })
        .where('owner_id = :ownerId', { ownerId })
        .andWhere('variant_id = :variantId', { variantId })
        .andWhere('source IN (:...sources)', {
          sources: [InventorySource.PERSONAL, InventorySource.SUPPLIER],
        })
        .execute();
    }

    return saved;
  }

  async archiveVariant(
    ownerId: string,
    groupId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, groupId, ownerId },
    });
    if (!variant) throw new NotFoundException('Size not found');

    const availability = await this.availabilityByVariant(ownerId, [variantId]);
    const available = availability.get(variantId) ?? 0;
    if (available > 0) {
      throw new BadRequestException(
        `Cannot remove a size that still has ${available} pieces in stock. Sell or adjust it to zero first.`,
      );
    }

    variant.archived = true;
    return this.variantRepo.save(variant);
  }

  // --------------------------------------------------------------- stock

  /**
   * Add per-size PERSONAL stock for a group in one atomic transaction. Upserts an
   * existing PERSONAL lot per (owner, variant), mirroring inventory.addPersonal.
   */
  async addStock(
    ownerId: string,
    groupId: string,
    dto: AddGroupStockDto,
  ): Promise<InventoryEntry[]> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, ownerId },
      relations: { variants: true },
    });
    if (!group) throw new NotFoundException('Product group not found');

    const variantById = new Map((group.variants ?? []).map((v) => [v.id, v]));
    for (const item of dto.items) {
      if (!variantById.has(item.variantId)) {
        throw new BadRequestException(
          `Size ${item.variantId} does not belong to this group`,
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const results: InventoryEntry[] = [];
      for (const item of dto.items) {
        const variant = variantById.get(item.variantId)!;
        // Cost on the stored lot: an explicit per-add cost, else the size's own
        // cost, else its share of the carton buying price.
        const unitCost =
          item.unitCost != null
            ? new Decimal(item.unitCost).toFixed(4)
            : this.deriveSizeCost(group.cartonBuyingPrice, variant, group.variants ?? []);
        const sellingPrice = new Decimal(
          item.sellingPrice ?? variant.sellingPrice,
        ).toFixed(4);

        const existing = await manager.findOne(InventoryEntry, {
          where: {
            ownerId,
            source: InventorySource.PERSONAL,
            variantId: variant.id,
          },
        });

        let saved: InventoryEntry;
        let qtyBefore: number;

        if (existing) {
          qtyBefore = existing.quantityRemaining;
          existing.quantityOriginal += item.quantity;
          existing.quantityRemaining += item.quantity;
          existing.unitCost = unitCost;
          existing.sellingPrice = sellingPrice;
          saved = await manager.save(InventoryEntry, existing);
        } else {
          qtyBefore = 0;
          const entry = manager.create(InventoryEntry, {
            ownerId,
            source: InventorySource.PERSONAL,
            productName: group.name,
            unitCost,
            sellingPrice,
            category: group.category,
            quantityOriginal: item.quantity,
            quantityRemaining: item.quantity,
            groupId: group.id,
            variantId: variant.id,
          });
          saved = await manager.save(InventoryEntry, entry);
        }

        await this.stockMovements.record(manager, {
          ownerId,
          entry: saved,
          reason: StockMovementReason.PURCHASE,
          qty: item.quantity,
          qtyBefore,
        });

        results.push(saved);
      }
      return results;
    });
  }

  // --------------------------------------------------------------- helpers

  /** Sellable pieces (PERSONAL + SUPPLIER + CONSIGNED_IN) per variant id. */
  private async availabilityByVariant(
    ownerId: string,
    variantIds: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (variantIds.length === 0) return out;

    const rows = await this.entryRepo.find({
      where: {
        ownerId,
        variantId: In(variantIds),
        source: In([
          InventorySource.PERSONAL,
          InventorySource.SUPPLIER,
          InventorySource.CONSIGNED_IN,
        ]),
      },
    });
    for (const r of rows) {
      if (!r.variantId) continue;
      out.set(r.variantId, (out.get(r.variantId) ?? 0) + r.quantityRemaining);
    }
    return out;
  }

  private toSummary(
    group: ProductGroup,
    availability: Map<string, number>,
  ): GroupWithAvailability {
    const variants = (group.variants ?? [])
      .filter((v) => !v.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map<VariantWithAvailability>((v) => ({
        id: v.id,
        label: v.label,
        unitCost: v.unitCost,
        sellingPrice: v.sellingPrice,
        piecesPerCarton: v.piecesPerCarton,
        sortOrder: v.sortOrder,
        available: availability.get(v.id) ?? 0,
      }));

    // A full carton needs a complete set of every size that has a positive
    // pieces-per-carton. Sizes with piecesPerCarton = 0 are sold loose only and
    // don't gate carton availability.
    const cartonGating = variants.filter((v) => v.piecesPerCarton > 0);
    const cartonsAvailable =
      cartonGating.length === 0
        ? 0
        : Math.min(
            ...cartonGating.map((v) =>
              Math.floor(v.available / v.piecesPerCarton),
            ),
          );

    return {
      id: group.id,
      name: group.name,
      category: group.category,
      cartonSellingPrice: group.cartonSellingPrice,
      cartonBuyingPrice: group.cartonBuyingPrice,
      archived: group.archived,
      variants,
      cartonsAvailable,
      totalPieces: variants.reduce((s, v) => s + v.available, 0),
    };
  }

  /**
   * Reject a group name that collides with an existing group, a simple product's
   * inventory entry, so simple and sized products never share a name (the read
   * model keys them apart by name).
   */
  private async assertNameFree(
    manager: EntityManager,
    ownerId: string,
    name: string,
  ): Promise<void> {
    const groupClash = await manager.findOne(ProductGroup, {
      where: { ownerId, name: ILike(name) },
    });
    if (groupClash) {
      throw new ConflictException(
        `A product group named "${name}" already exists`,
      );
    }
    const entryClash = await manager.findOne(InventoryEntry, {
      where: { ownerId, productName: ILike(name), variantId: IsNull() },
    });
    if (entryClash) {
      throw new ConflictException(
        `A simple product named "${name}" already exists. Choose a different name.`,
      );
    }
  }
}
