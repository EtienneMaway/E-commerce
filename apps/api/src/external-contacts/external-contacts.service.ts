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
  ExternalContact,
  ExternalContactRole,
  ExternalTransaction,
  ExternalTransactionType,
  InventoryEntry,
  InventorySource,
} from '../entities';
import { CreateExternalContactDto } from './dto/create-external-contact.dto';
import { UpdateExternalContactDto } from './dto/update-external-contact.dto';
import { RecordProductOutDto } from './dto/record-product-out.dto';
import { RecordPaymentInDto } from './dto/record-payment-in.dto';
import { RecordProductInDto } from './dto/record-product-in.dto';
import { RecordPaymentOutDto } from './dto/record-payment-out.dto';

@Injectable()
export class ExternalContactsService {
  constructor(
    @InjectRepository(ExternalContact)
    private readonly contactRepo: Repository<ExternalContact>,
    @InjectRepository(ExternalTransaction)
    private readonly txRepo: Repository<ExternalTransaction>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll(ownerId: string): Promise<ExternalContact[]> {
    return this.contactRepo.find({
      where: { ownerId },
      order: { name: 'ASC' },
    });
  }

  async findOne(ownerId: string, id: string): Promise<ExternalContact> {
    const contact = await this.contactRepo.findOne({
      where: { id, ownerId },
      relations: { transactions: true },
      order: { transactions: { createdAt: 'DESC' } },
    });
    if (!contact) throw new NotFoundException('External contact not found');
    return contact;
  }

  async create(ownerId: string, dto: CreateExternalContactDto): Promise<ExternalContact> {
    const contact = this.contactRepo.create({
      ownerId,
      name: dto.name.trim(),
      phone: dto.phone?.trim() ?? null,
      notes: dto.notes?.trim() ?? null,
      role: dto.role,
      debtorBalance: '0.00',
      supplierBalance: '0.00',
    });
    return this.contactRepo.save(contact);
  }

  async update(ownerId: string, id: string, dto: UpdateExternalContactDto): Promise<ExternalContact> {
    const contact = await this.contactRepo.findOne({ where: { id, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (dto.name !== undefined) contact.name = dto.name.trim();
    if (dto.phone !== undefined) contact.phone = dto.phone.trim() || null;
    if (dto.notes !== undefined) contact.notes = dto.notes.trim() || null;
    if (dto.role !== undefined) contact.role = dto.role;
    return this.contactRepo.save(contact);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const contact = await this.contactRepo.findOne({ where: { id, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    await this.contactRepo.remove(contact);
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  /**
   * Give products to an external debtor.
   * Deducts from trader's inventory (SUPPLIER-first), increases debtorBalance.
   */
  async recordProductOut(
    ownerId: string,
    contactId: string,
    dto: RecordProductOutDto,
  ): Promise<ExternalTransaction> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.SUPPLIER) {
      throw new BadRequestException('This contact is a supplier, not a debtor');
    }

    return this.dataSource.transaction(async (manager) => {
      // Find available stock (SUPPLIER-first)
      const productNameNorm = dto.productName.trim().toLowerCase();
      const entries = await manager.find(InventoryEntry, {
        where: [
          { ownerId, productName: ILike(productNameNorm), source: InventorySource.SUPPLIER },
          { ownerId, productName: ILike(productNameNorm), source: InventorySource.PERSONAL },
        ],
        order: { createdAt: 'ASC' },
      });

      const sorted = [
        ...entries.filter((e) => e.source === InventorySource.SUPPLIER),
        ...entries.filter((e) => e.source === InventorySource.PERSONAL),
      ].filter((e) => e.quantityRemaining > 0);

      const totalAvailable = sorted.reduce((sum, e) => sum + e.quantityRemaining, 0);
      if (totalAvailable < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${totalAvailable}, requested: ${dto.quantity}`,
        );
      }

      // Deduct stock and capture weighted average unit cost
      let remaining = dto.quantity;
      let totalCostDeducted = new Decimal(0);
      let totalQtyDeducted = 0;
      for (const entry of sorted) {
        if (remaining === 0) break;
        const deduct = Math.min(entry.quantityRemaining, remaining);
        totalCostDeducted = totalCostDeducted.plus(new Decimal(entry.unitCost).mul(deduct));
        totalQtyDeducted += deduct;
        entry.quantityRemaining -= deduct;
        remaining -= deduct;
        await manager.save(InventoryEntry, entry);
      }

      const unitCostUsed = totalQtyDeducted > 0
        ? totalCostDeducted.div(totalQtyDeducted).toFixed(4)
        : dto.unitPrice;

      const amount = new Decimal(dto.unitPrice).mul(dto.quantity).toFixed(2);
      const profit = new Decimal(dto.unitPrice).minus(unitCostUsed).mul(dto.quantity).toFixed(2);
      const isLoss = new Decimal(profit).lt(0);

      // Update balance
      contact.debtorBalance = new Decimal(contact.debtorBalance).plus(amount).toFixed(2);
      await manager.save(ExternalContact, contact);

      // Record transaction
      const tx = manager.create(ExternalTransaction, {
        ownerId,
        contactId,
        type: ExternalTransactionType.PRODUCT_OUT,
        productName: productNameNorm,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        amount,
        unitCostUsed,
        profit,
        isLoss,
        notes: dto.notes ?? null,
      });
      return manager.save(ExternalTransaction, tx);
    });
  }

  /**
   * Record cash received from an external debtor.
   * Decreases debtorBalance.
   */
  async recordPaymentIn(
    ownerId: string,
    contactId: string,
    dto: RecordPaymentInDto,
  ): Promise<ExternalTransaction> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.SUPPLIER) {
      throw new BadRequestException('This contact is a supplier, not a debtor');
    }

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be greater than zero');

    return this.dataSource.transaction(async (manager) => {
      contact.debtorBalance = new Decimal(contact.debtorBalance).minus(amount).toFixed(2);
      await manager.save(ExternalContact, contact);

      const tx = manager.create(ExternalTransaction, {
        ownerId,
        contactId,
        type: ExternalTransactionType.PAYMENT_IN,
        productName: null,
        quantity: null,
        unitPrice: null,
        amount: amount.toFixed(2),
        unitCostUsed: null,
        profit: null,
        isLoss: null,
        notes: dto.notes ?? null,
      });
      return manager.save(ExternalTransaction, tx);
    });
  }

  /**
   * Record products received from an external supplier.
   * Adds to trader's inventory as PERSONAL stock, increases supplierBalance.
   */
  async recordProductIn(
    ownerId: string,
    contactId: string,
    dto: RecordProductInDto,
  ): Promise<ExternalTransaction> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.DEBTOR) {
      throw new BadRequestException('This contact is a debtor, not a supplier');
    }

    return this.dataSource.transaction(async (manager) => {
      // Add to inventory
      const entry = manager.create(InventoryEntry, {
        ownerId,
        source: InventorySource.PERSONAL,
        productName: dto.productName.trim().toLowerCase(),
        unitCost: dto.unitCost,
        sellingPrice: dto.sellingPrice,
        category: dto.category ?? null,
        quantityOriginal: dto.quantity,
        quantityRemaining: dto.quantity,
      });
      await manager.save(InventoryEntry, entry);

      const amount = new Decimal(dto.unitCost).mul(dto.quantity).toFixed(2);

      // Update balance
      contact.supplierBalance = new Decimal(contact.supplierBalance).plus(amount).toFixed(2);
      await manager.save(ExternalContact, contact);

      // Record transaction
      const tx = manager.create(ExternalTransaction, {
        ownerId,
        contactId,
        type: ExternalTransactionType.PRODUCT_IN,
        productName: dto.productName.trim().toLowerCase(),
        quantity: dto.quantity,
        unitPrice: dto.unitCost,
        amount,
        unitCostUsed: null,
        profit: null,
        isLoss: null,
        notes: dto.notes ?? null,
      });
      return manager.save(ExternalTransaction, tx);
    });
  }

  /**
   * Record cash paid to an external supplier.
   * Decreases supplierBalance.
   */
  async recordPaymentOut(
    ownerId: string,
    contactId: string,
    dto: RecordPaymentOutDto,
  ): Promise<ExternalTransaction> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.DEBTOR) {
      throw new BadRequestException('This contact is a debtor, not a supplier');
    }

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be greater than zero');

    return this.dataSource.transaction(async (manager) => {
      contact.supplierBalance = new Decimal(contact.supplierBalance).minus(amount).toFixed(2);
      await manager.save(ExternalContact, contact);

      const tx = manager.create(ExternalTransaction, {
        ownerId,
        contactId,
        type: ExternalTransactionType.PAYMENT_OUT,
        productName: null,
        quantity: null,
        unitPrice: null,
        amount: amount.toFixed(2),
        unitCostUsed: null,
        profit: null,
        isLoss: null,
        notes: dto.notes ?? null,
      });
      return manager.save(ExternalTransaction, tx);
    });
  }

  /**
   * Delete a transaction and reverse its effect on the contact's balance.
   * NOTE: Inventory changes from PRODUCT_OUT / PRODUCT_IN are NOT reversed.
   */
  async deleteTransaction(ownerId: string, contactId: string, txId: string): Promise<void> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');

    const tx = await this.txRepo.findOne({ where: { id: txId, contactId, ownerId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    // Check ownership
    if (tx.ownerId !== ownerId) throw new ForbiddenException('Access denied');

    return this.dataSource.transaction(async (manager) => {
      const amount = new Decimal(tx.amount);

      // Reverse balance effect
      switch (tx.type) {
        case ExternalTransactionType.PRODUCT_OUT:
        case ExternalTransactionType.PAYMENT_IN:
          // PRODUCT_OUT increased debtorBalance; PAYMENT_IN decreased it
          if (tx.type === ExternalTransactionType.PRODUCT_OUT) {
            contact.debtorBalance = new Decimal(contact.debtorBalance).minus(amount).toFixed(2);
          } else {
            contact.debtorBalance = new Decimal(contact.debtorBalance).plus(amount).toFixed(2);
          }
          break;
        case ExternalTransactionType.PRODUCT_IN:
        case ExternalTransactionType.PAYMENT_OUT:
          // PRODUCT_IN increased supplierBalance; PAYMENT_OUT decreased it
          if (tx.type === ExternalTransactionType.PRODUCT_IN) {
            contact.supplierBalance = new Decimal(contact.supplierBalance).minus(amount).toFixed(2);
          } else {
            contact.supplierBalance = new Decimal(contact.supplierBalance).plus(amount).toFixed(2);
          }
          break;
      }

      await manager.save(ExternalContact, contact);
      await manager.remove(ExternalTransaction, tx);
    });
  }
}
