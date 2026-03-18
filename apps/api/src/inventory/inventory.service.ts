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
  SupplierDebt,
  User,
} from '../entities';
import { AddPersonalDto } from './dto/add-personal.dto';
import { ReceiveFromSupplierDto } from './dto/receive-from-supplier.dto';
import { ConsignToDebtorDto } from './dto/consign-to-debtor.dto';
import { InventoryFilterDto } from './dto/inventory-filter.dto';
import { UpdateSellingPriceDto } from './dto/update-selling-price.dto';

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
  ) {}

  async findAll(ownerId: string, filter: InventoryFilterDto): Promise<InventoryEntry[]> {
    const where: Record<string, unknown> = { ownerId };
    if (filter.source) where.source = filter.source;
    if (filter.supplierUserId) where.supplierUserId = filter.supplierUserId;
    if (filter.category) where.category = ILike(`%${filter.category}%`);

    return this.entryRepo.find({
      where,
      relations: { supplierUser: true, debtorUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  async addPersonal(ownerId: string, dto: AddPersonalDto): Promise<InventoryEntry> {
    const entry = this.entryRepo.create({
      ownerId,
      source: InventorySource.PERSONAL,
      productName: dto.productName.trim().toLowerCase(),
      unitCost: dto.unitCost,
      sellingPrice: dto.sellingPrice,
      category: dto.category ?? null,
      quantityOriginal: dto.quantity,
      quantityRemaining: dto.quantity,
    });
    return this.entryRepo.save(entry);
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
      // Create inventory entry
      const entry = manager.create(InventoryEntry, {
        ownerId,
        source: InventorySource.SUPPLIER,
        productName: dto.productName.trim().toLowerCase(),
        unitCost: dto.unitCost,
        sellingPrice: dto.sellingPrice,
        category: dto.category ?? null,
        quantityOriginal: dto.quantity,
        quantityRemaining: dto.quantity,
        supplierUserId: dto.supplierUserId,
      });
      const savedEntry = await manager.save(InventoryEntry, entry);

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

      // Deduct from source entries
      let remaining = dto.quantity;
      for (const entry of sorted) {
        if (remaining === 0) break;
        const deduct = Math.min(entry.quantityRemaining, remaining);
        entry.quantityRemaining -= deduct;
        remaining -= deduct;
        await manager.save(InventoryEntry, entry);
      }

      // Determine unitCost from the stock that was deducted (use first matching entry's cost)
      const sourceCost = sorted[0]?.unitCost ?? dto.agreedUnitPrice;

      // Create consigned-out entry
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
    if (entry.source !== InventorySource.CONSIGNED_IN) {
      throw new BadRequestException('Selling price can only be updated on CONSIGNED_IN entries');
    }

    entry.sellingPrice = dto.sellingPrice;
    return this.entryRepo.save(entry);
  }
}
