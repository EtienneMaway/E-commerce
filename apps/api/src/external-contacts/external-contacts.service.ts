import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import {
  ExternalContact,
  ExternalContactRole,
  ExternalTransaction,
  ExternalTransactionType,
  InventoryEntry,
  InventorySource,
  StockMovementReason,
} from '../entities';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { PricingService } from '../pricing/pricing.service';
import { ActorContext } from '../common/types/actor-context';
import { CreateExternalContactDto } from './dto/create-external-contact.dto';
import { UpdateExternalContactDto } from './dto/update-external-contact.dto';
import { RecordProductOutDto } from './dto/record-product-out.dto';
import { RecordPaymentInDto } from './dto/record-payment-in.dto';
import { RecordProductInDto } from './dto/record-product-in.dto';
import { RecordPaymentOutDto } from './dto/record-payment-out.dto';
import { RecordProductOutBatchDto } from './dto/record-product-out-batch.dto';
import { RecordProductInBatchDto } from './dto/record-product-in-batch.dto';

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
    private readonly stockMovements: StockMovementsService,
    private readonly pricingService: PricingService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll(ctx: ActorContext): Promise<ExternalContact[]> {
    return this.contactRepo.find({
      where: { ownerId: ctx.effectiveOwnerId },
      order: { name: 'ASC' },
    });
  }

  async findOne(ctx: ActorContext, id: string): Promise<ExternalContact> {
    // Transactions are paginated through listTransactions() to avoid loading
    // arbitrarily many rows in one request.
    const contact = await this.contactRepo.findOne({
      where: { id, ownerId: ctx.effectiveOwnerId },
    });
    if (!contact) throw new NotFoundException('External contact not found');
    return contact;
  }

  async listTransactions(
    ctx: ActorContext,
    id: string,
    page = 1,
    limit = 10,
  ): Promise<{
    data: ExternalTransaction[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const contact = await this.contactRepo.findOne({
      where: { id, ownerId: ctx.effectiveOwnerId },
    });
    if (!contact) throw new NotFoundException('External contact not found');

    const [data, total] = await this.txRepo.findAndCount({
      where: { ownerId: ctx.effectiveOwnerId, contactId: id },
      relations: { actor: true },
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

  async create(ctx: ActorContext, dto: CreateExternalContactDto): Promise<ExternalContact> {
    const contact = this.contactRepo.create({
      ownerId: ctx.effectiveOwnerId,
      name: dto.name.trim(),
      phone: dto.phone?.trim() ?? null,
      notes: dto.notes?.trim() ?? null,
      role: dto.role,
      debtorBalance: '0.00',
      supplierBalance: '0.00',
    });
    return this.contactRepo.save(contact);
  }

  async update(ctx: ActorContext, id: string, dto: UpdateExternalContactDto): Promise<ExternalContact> {
    const contact = await this.contactRepo.findOne({ where: { id, ownerId: ctx.effectiveOwnerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (dto.name !== undefined) contact.name = dto.name.trim();
    if (dto.phone !== undefined) contact.phone = dto.phone.trim() || null;
    if (dto.notes !== undefined) contact.notes = dto.notes.trim() || null;
    if (dto.role !== undefined) contact.role = dto.role;
    return this.contactRepo.save(contact);
  }

  async remove(ctx: ActorContext, id: string): Promise<void> {
    const contact = await this.contactRepo.findOne({ where: { id, ownerId: ctx.effectiveOwnerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    await this.contactRepo.remove(contact);
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  async recordProductOut(
    ctx: ActorContext,
    contactId: string,
    dto: RecordProductOutDto,
  ): Promise<ExternalTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.SUPPLIER) {
      throw new BadRequestException('This contact is a supplier, not a debtor');
    }

    // Apply employee pricing rule on the unit price.
    const priceCheck = await this.pricingService.applyEmployeePriceRule({
      ctx,
      productName: dto.productName,
      submittedUnitPrice: dto.unitPrice,
      discountReason: dto.discountReason,
    });

    return this.dataSource.transaction(async (manager) => {
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

      let remaining = dto.quantity;
      let totalCostDeducted = new Decimal(0);
      let totalQtyDeducted = 0;
      for (const entry of sorted) {
        if (remaining === 0) break;
        const deduct = Math.min(entry.quantityRemaining, remaining);
        const qtyBefore = entry.quantityRemaining;
        totalCostDeducted = totalCostDeducted.plus(new Decimal(entry.unitCost).mul(deduct));
        totalQtyDeducted += deduct;
        entry.quantityRemaining -= deduct;
        remaining -= deduct;
        await manager.save(InventoryEntry, entry);

        await this.stockMovements.record(manager, {
          ownerId,
          entry,
          reason: StockMovementReason.EXTERNAL_OUT,
          qty: deduct,
          qtyBefore,
          notes: dto.notes ?? null,
        });
      }

      const unitCostUsed = totalQtyDeducted > 0
        ? totalCostDeducted.div(totalQtyDeducted).toFixed(4)
        : priceCheck.effectiveUnitPrice;

      const amount = new Decimal(priceCheck.effectiveUnitPrice).mul(dto.quantity).toFixed(2);

      contact.debtorBalance = new Decimal(contact.debtorBalance).plus(amount).toFixed(2);
      await manager.save(ExternalContact, contact);

      const tx = manager.create(ExternalTransaction, {
        ownerId,
        actorId,
        contactId,
        type: ExternalTransactionType.PRODUCT_OUT,
        productName: productNameNorm,
        quantity: dto.quantity,
        unitPrice: priceCheck.effectiveUnitPrice,
        amount,
        unitCostUsed,
        profit: null,
        isLoss: null,
        notes: dto.notes ?? null,
        originalUnitPrice: priceCheck.originalUnitPrice,
        discountReason: priceCheck.originalUnitPrice ? dto.discountReason ?? null : null,
      });
      return manager.save(ExternalTransaction, tx);
    });
  }

  // ─── Batch: give N products in one atomic transaction ───────────────────
  async recordProductOutBatch(
    ctx: ActorContext,
    contactId: string,
    dto: RecordProductOutBatchDto,
  ): Promise<ExternalTransaction[]> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.SUPPLIER) {
      throw new BadRequestException('This contact is a supplier, not a debtor');
    }

    // Apply pricing rule per item up-front (outside the DB transaction —
    // raises UnprocessableEntity if employee underprices without override).
    const priceChecks = await Promise.all(
      dto.items.map((item) =>
        this.pricingService.applyEmployeePriceRule({
          ctx,
          productName: item.productName,
          submittedUnitPrice: item.unitPrice,
          discountReason: item.discountReason,
        }),
      ),
    );

    const batchId = randomUUID();

    return this.dataSource.transaction(async (manager) => {
      const created: ExternalTransaction[] = [];
      let batchTotal = new Decimal(0);

      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const priceCheck = priceChecks[i];
        const productNameNorm = item.productName.trim().toLowerCase();

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
        if (totalAvailable < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${productNameNorm}. Available: ${totalAvailable}, requested: ${item.quantity}`,
          );
        }

        let remaining = item.quantity;
        let totalCostDeducted = new Decimal(0);
        let totalQtyDeducted = 0;
        for (const entry of sorted) {
          if (remaining === 0) break;
          const deduct = Math.min(entry.quantityRemaining, remaining);
          const qtyBefore = entry.quantityRemaining;
          totalCostDeducted = totalCostDeducted.plus(new Decimal(entry.unitCost).mul(deduct));
          totalQtyDeducted += deduct;
          entry.quantityRemaining -= deduct;
          remaining -= deduct;
          await manager.save(InventoryEntry, entry);

          await this.stockMovements.record(manager, {
            ownerId,
            entry,
            reason: StockMovementReason.EXTERNAL_OUT,
            qty: deduct,
            qtyBefore,
            notes: dto.notes ?? null,
          });
        }

        const unitCostUsed = totalQtyDeducted > 0
          ? totalCostDeducted.div(totalQtyDeducted).toFixed(4)
          : priceCheck.effectiveUnitPrice;

        const amount = new Decimal(priceCheck.effectiveUnitPrice).mul(item.quantity).toFixed(2);
        batchTotal = batchTotal.plus(amount);

        const tx = manager.create(ExternalTransaction, {
          ownerId,
          actorId,
          contactId,
          type: ExternalTransactionType.PRODUCT_OUT,
          productName: productNameNorm,
          quantity: item.quantity,
          unitPrice: priceCheck.effectiveUnitPrice,
          amount,
          unitCostUsed,
          profit: null,
          isLoss: null,
          notes: dto.notes ?? null,
          originalUnitPrice: priceCheck.originalUnitPrice,
          discountReason: priceCheck.originalUnitPrice ? item.discountReason ?? null : null,
          batchId,
        });
        const saved = await manager.save(ExternalTransaction, tx);
        created.push(saved);
      }

      contact.debtorBalance = new Decimal(contact.debtorBalance).plus(batchTotal).toFixed(2);
      await manager.save(ExternalContact, contact);

      return created;
    });
  }

  async recordPaymentIn(
    ctx: ActorContext,
    contactId: string,
    dto: RecordPaymentInDto,
  ): Promise<ExternalTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

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

      const productOuts = await manager.find(ExternalTransaction, {
        where: {
          ownerId,
          contactId,
          type: ExternalTransactionType.PRODUCT_OUT,
        },
      });

      let totalSelling = new Decimal(0);
      let totalCost = new Decimal(0);
      for (const po of productOuts) {
        const qty = new Decimal(po.quantity ?? 0);
        totalSelling = totalSelling.plus(po.amount);
        if (po.unitCostUsed) {
          totalCost = totalCost.plus(new Decimal(po.unitCostUsed).mul(qty));
        }
      }

      let profit: string | null = null;
      let isLoss: boolean | null = null;
      if (totalSelling.gt(0)) {
        const marginRatio = totalSelling.minus(totalCost).div(totalSelling);
        profit = amount.mul(marginRatio).toFixed(2);
        isLoss = new Decimal(profit).lt(0);
      }

      const tx = manager.create(ExternalTransaction, {
        ownerId,
        actorId,
        contactId,
        type: ExternalTransactionType.PAYMENT_IN,
        productName: null,
        quantity: null,
        unitPrice: null,
        amount: amount.toFixed(2),
        unitCostUsed: null,
        profit,
        isLoss,
        notes: dto.notes ?? null,
      });
      return manager.save(ExternalTransaction, tx);
    });
  }

  async recordProductIn(
    ctx: ActorContext,
    contactId: string,
    dto: RecordProductInDto,
  ): Promise<ExternalTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.DEBTOR) {
      throw new BadRequestException('This contact is a debtor, not a supplier');
    }

    return this.dataSource.transaction(async (manager) => {
      const entry = manager.create(InventoryEntry, {
        ownerId,
        actorId,
        source: InventorySource.PERSONAL,
        productName: dto.productName.trim().toLowerCase(),
        unitCost: dto.unitCost,
        sellingPrice: dto.sellingPrice,
        category: dto.category ?? null,
        quantityOriginal: dto.quantity,
        quantityRemaining: dto.quantity,
      });
      await manager.save(InventoryEntry, entry);

      await this.stockMovements.record(manager, {
        ownerId,
        entry,
        reason: StockMovementReason.EXTERNAL_IN,
        qty: dto.quantity,
        qtyBefore: 0,
        notes: dto.notes ?? null,
      });

      const amount = new Decimal(dto.unitCost).mul(dto.quantity).toFixed(2);

      contact.supplierBalance = new Decimal(contact.supplierBalance).plus(amount).toFixed(2);
      await manager.save(ExternalContact, contact);

      const tx = manager.create(ExternalTransaction, {
        ownerId,
        actorId,
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

  // ─── Batch: receive N products in one atomic transaction ─────────────────
  async recordProductInBatch(
    ctx: ActorContext,
    contactId: string,
    dto: RecordProductInBatchDto,
  ): Promise<ExternalTransaction[]> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');
    if (contact.role === ExternalContactRole.DEBTOR) {
      throw new BadRequestException('This contact is a debtor, not a supplier');
    }

    const batchId = randomUUID();

    return this.dataSource.transaction(async (manager) => {
      const created: ExternalTransaction[] = [];
      let batchTotal = new Decimal(0);

      for (const item of dto.items) {
        const productNameNorm = item.productName.trim().toLowerCase();
        const entry = manager.create(InventoryEntry, {
          ownerId,
          actorId,
          source: InventorySource.PERSONAL,
          productName: productNameNorm,
          unitCost: item.unitCost,
          sellingPrice: item.sellingPrice,
          category: item.category ?? null,
          quantityOriginal: item.quantity,
          quantityRemaining: item.quantity,
        });
        await manager.save(InventoryEntry, entry);

        await this.stockMovements.record(manager, {
          ownerId,
          entry,
          reason: StockMovementReason.EXTERNAL_IN,
          qty: item.quantity,
          qtyBefore: 0,
          notes: dto.notes ?? null,
        });

        const amount = new Decimal(item.unitCost).mul(item.quantity).toFixed(2);
        batchTotal = batchTotal.plus(amount);

        const tx = manager.create(ExternalTransaction, {
          ownerId,
          actorId,
          contactId,
          type: ExternalTransactionType.PRODUCT_IN,
          productName: productNameNorm,
          quantity: item.quantity,
          unitPrice: item.unitCost,
          amount,
          unitCostUsed: null,
          profit: null,
          isLoss: null,
          notes: dto.notes ?? null,
          batchId,
        });
        const saved = await manager.save(ExternalTransaction, tx);
        created.push(saved);
      }

      contact.supplierBalance = new Decimal(contact.supplierBalance).plus(batchTotal).toFixed(2);
      await manager.save(ExternalContact, contact);

      return created;
    });
  }

  async recordPaymentOut(
    ctx: ActorContext,
    contactId: string,
    dto: RecordPaymentOutDto,
  ): Promise<ExternalTransaction> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

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
        actorId,
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

  async deleteTransaction(ctx: ActorContext, contactId: string, txId: string): Promise<void> {
    const ownerId = ctx.effectiveOwnerId;
    const contact = await this.contactRepo.findOne({ where: { id: contactId, ownerId } });
    if (!contact) throw new NotFoundException('External contact not found');

    const tx = await this.txRepo.findOne({ where: { id: txId, contactId, ownerId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.ownerId !== ownerId) throw new ForbiddenException('Access denied');

    return this.dataSource.transaction(async (manager) => {
      const amount = new Decimal(tx.amount);

      switch (tx.type) {
        case ExternalTransactionType.PRODUCT_OUT:
        case ExternalTransactionType.PAYMENT_IN:
          if (tx.type === ExternalTransactionType.PRODUCT_OUT) {
            contact.debtorBalance = new Decimal(contact.debtorBalance).minus(amount).toFixed(2);
          } else {
            contact.debtorBalance = new Decimal(contact.debtorBalance).plus(amount).toFixed(2);
          }
          break;
        case ExternalTransactionType.PRODUCT_IN:
        case ExternalTransactionType.PAYMENT_OUT:
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
