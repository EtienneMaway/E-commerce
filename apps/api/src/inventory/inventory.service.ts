import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  DebtorCredit,
  InventoryEntry,
  InventorySource,
  ManualStockMovementReason,
  NOTES_REQUIRED_REASONS,
  POSITIVE_REASONS,
  StockMovement,
  StockMovementReason,
  SupplierDebt,
  User,
} from '../entities';
import { StockMovementsService } from '../stock-movements/stock-movements.service';

export interface ProductSummary {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  totalAvailable: number;
  sourceBreakdown: {
    personal: number;
    supplier: number;
    consignedIn: number;
    consignedOut: number;
  };
  latestSellingPrice: string;
  latestUnitCost: string;
}

import { AddPersonalDto } from './dto/add-personal.dto';
import { ReceiveFromSupplierDto } from './dto/receive-from-supplier.dto';
import { ConsignToDebtorDto } from './dto/consign-to-debtor.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { UpdateSellingPriceDto } from './dto/update-selling-price.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

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
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
  ) {}

  async findAll(ownerId: string, filter: InventoryFilterDto): Promise<InventoryEntry[]> {
    const where: Record<string, unknown> = { ownerId };
    if (filter.source) where.source = filter.source;
    if (filter.supplierUserId) where.supplierUserId = filter.supplierUserId;
    if (filter.category) where.category = ILike(`%${filter.category}%`);
    if (filter.productName) where.productName = ILike(filter.productName.trim().toLowerCase());

    return this.entryRepo.find({
      where,
      relations: { supplierUser: true, debtorUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getProductList(ownerId: string): Promise<ProductSummary[]> {
    const entries = await this.entryRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });

    const productMap = new Map<string, InventoryEntry[]>();
    for (const entry of entries) {
      const existing = productMap.get(entry.productName) ?? [];
      existing.push(entry);
      productMap.set(entry.productName, existing);
    }

    const summaries: ProductSummary[] = [];
    for (const [productName, productEntries] of productMap) {
      const personal = productEntries.filter((e) => e.source === InventorySource.PERSONAL);
      const supplier = productEntries.filter((e) => e.source === InventorySource.SUPPLIER);
      const consignedIn = productEntries.filter((e) => e.source === InventorySource.CONSIGNED_IN);
      const consignedOut = productEntries.filter((e) => e.source === InventorySource.CONSIGNED_OUT);

      const personalQty = personal.reduce((s, e) => s + e.quantityRemaining, 0);
      const supplierQty = supplier.reduce((s, e) => s + e.quantityRemaining, 0);
      const consignedInQty = consignedIn.reduce((s, e) => s + e.quantityRemaining, 0);
      const consignedOutQty = consignedOut.reduce((s, e) => s + e.quantityRemaining, 0);

      const piecesPerCarton = productEntries.find((e) => e.piecesPerCarton !== null)?.piecesPerCarton ?? null;
      const latestCartonPrice = productEntries.find((e) => e.cartonPrice !== null)?.cartonPrice ?? null;
      const category = productEntries.find((e) => e.category !== null)?.category ?? null;

      const sellable = [...personal, ...supplier, ...consignedIn];
      const latestSellingPrice = sellable[0]?.sellingPrice ?? '0.00';
      const latestUnitCost = sellable[0]?.unitCost ?? '0.00';

      summaries.push({
        productName,
        category,
        piecesPerCarton,
        latestCartonPrice,
        totalAvailable: personalQty + supplierQty + consignedInQty,
        sourceBreakdown: {
          personal: personalQty,
          supplier: supplierQty,
          consignedIn: consignedInQty,
          consignedOut: consignedOutQty,
        },
        latestSellingPrice,
        latestUnitCost,
      });
    }

    return summaries;
  }

  async addPersonal(ownerId: string, dto: AddPersonalDto): Promise<InventoryEntry> {
    const normalizedName = dto.productName.trim().toLowerCase();

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(InventoryEntry, {
        where: { ownerId, source: InventorySource.PERSONAL, productName: ILike(normalizedName) },
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
        if (dto.piecesPerCarton !== undefined) existing.piecesPerCarton = dto.piecesPerCarton;
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
    });
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
        if (dto.cartonPrice !== undefined) existing.cartonPrice = dto.cartonPrice;
        if (dto.piecesPerCarton !== undefined) existing.piecesPerCarton = dto.piecesPerCarton;
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
      const creditValue = new Decimal(dto.unitCost).mul(dto.quantity).toFixed(2);

      let debt = await manager.findOne(SupplierDebt, {
        where: { ownerId, supplierUserId: dto.supplierUserId },
      });

      if (!debt) {
        debt = manager.create(SupplierDebt, {
          ownerId,
          supplierUserId: dto.supplierUserId,
          totalCreditReceived: creditValue,
          totalPaid: '0.00',
          outstandingBalance: creditValue,
        });
      } else {
        debt.totalCreditReceived = new Decimal(debt.totalCreditReceived)
          .plus(creditValue)
          .toFixed(2);
        debt.outstandingBalance = new Decimal(debt.outstandingBalance)
          .plus(creditValue)
          .toFixed(2);
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
    const debtor = await this.userRepo.findOne({ where: { id: dto.debtorUserId } });
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
        ...availableEntries.filter((e) => e.source === InventorySource.SUPPLIER),
        ...availableEntries.filter((e) => e.source === InventorySource.PERSONAL),
      ].filter((e) => e.quantityRemaining > 0);

      const totalAvailable = sorted.reduce((sum, e) => sum + e.quantityRemaining, 0);
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
        .toFixed(2);

      let credit = await manager.findOne(DebtorCredit, {
        where: { ownerId, debtorUserId: dto.debtorUserId },
      });

      if (!credit) {
        credit = manager.create(DebtorCredit, {
          ownerId,
          debtorUserId: dto.debtorUserId,
          totalCreditGiven: creditValue,
          totalReceived: '0.00',
          outstandingBalance: creditValue,
        });
      } else {
        credit.totalCreditGiven = new Decimal(credit.totalCreditGiven)
          .plus(creditValue)
          .toFixed(2);
        credit.outstandingBalance = new Decimal(credit.outstandingBalance)
          .plus(creditValue)
          .toFixed(2);
      }

      const savedCredit = await manager.save(DebtorCredit, credit);

      // Link entry to credit
      savedEntry.debtorCreditId = savedCredit.id;
      await manager.save(InventoryEntry, savedEntry);

      return savedEntry;
    });
  }

  async updateSellingPrice(
    ownerId: string,
    entryId: string,
    dto: UpdateSellingPriceDto,
  ): Promise<InventoryEntry> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Inventory entry not found');
    if (entry.ownerId !== ownerId) throw new ForbiddenException('You do not own this inventory entry');
    if (entry.source === InventorySource.CONSIGNED_OUT) {
      throw new BadRequestException('Selling price cannot be updated on CONSIGNED_OUT entries');
    }

    entry.sellingPrice = dto.sellingPrice;
    return this.entryRepo.save(entry);
  }

  async adjustStock(
    ownerId: string,
    entryId: string,
    dto: AdjustStockDto,
  ): Promise<{ entry: InventoryEntry; movement: StockMovement }> {
    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.findOne(InventoryEntry, { where: { id: entryId } });
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
      if (NOTES_REQUIRED_REASONS.has(reason) && (!dto.notes || dto.notes.trim() === '')) {
        throw new BadRequestException(`Notes are required for reason ${reason}`);
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
        if (entry.source !== InventorySource.SUPPLIER || !entry.supplierDebtId) {
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
        const newCredit = new Decimal(debt.totalCreditReceived).minus(valueReturned);
        const newOutstanding = new Decimal(debt.outstandingBalance).minus(valueReturned);
        if (newOutstanding.lt(0)) {
          throw new BadRequestException(
            'Returned value exceeds outstanding debt — record a refund instead',
          );
        }
        debt.totalCreditReceived = newCredit.toFixed(2);
        debt.outstandingBalance = newOutstanding.toFixed(2);
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
}
