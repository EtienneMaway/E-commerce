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
  ConsignmentItem,
  ConsignmentRequest,
  ConsignmentStatus,
  DebtorCredit,
  InventoryEntry,
  InventorySource,
  StockMovementReason,
  SupplierDebt,
  User,
} from '../entities';
import { CreateConsignmentDto } from './dto/create-consignment.dto';
import { StockMovementsService } from '../stock-movements/stock-movements.service';

@Injectable()
export class ConsignmentsService {
  constructor(
    @InjectRepository(ConsignmentRequest)
    private readonly requestRepo: Repository<ConsignmentRequest>,
    @InjectRepository(ConsignmentItem)
    private readonly itemRepo: Repository<ConsignmentItem>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(DebtorCredit)
    private readonly debtorCreditRepo: Repository<DebtorCredit>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
  ) {}

  // ─── Supplier: create a consignment request ────────────────────────────────

  async create(supplierId: string, dto: CreateConsignmentDto): Promise<ConsignmentRequest> {
    const debtor = await this.userRepo.findOne({ where: { id: dto.debtorUserId } });
    if (!debtor) throw new NotFoundException('Debtor user not found');
    if (debtor.id === supplierId) {
      throw new BadRequestException('You cannot consign goods to yourself');
    }

    // Soft-validate stock availability for each item
    for (const item of dto.items) {
      const available = await this.countAvailableStock(supplierId, item.productName);
      if (available < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${item.productName}". Available: ${available}, requested: ${item.quantity}`,
        );
      }
    }

    // Build the request entity (items are cascaded)
    const request = this.requestRepo.create({
      supplierId,
      debtorId: dto.debtorUserId,
      status: ConsignmentStatus.PENDING,
      note: dto.note ?? null,
    });

    // Resolve unit costs from supplier's stock for audit trail
    const itemEntities: ConsignmentItem[] = [];
    for (const dto_item of dto.items) {
      const stockEntries = await this.getStockEntriesSorted(supplierId, dto_item.productName);
      const unitCost = stockEntries[0]?.unitCost ?? dto_item.agreedUnitPrice;
      itemEntities.push(
        this.itemRepo.create({
          productName: dto_item.productName.trim().toLowerCase(),
          quantity: dto_item.quantity,
          agreedUnitPrice: dto_item.agreedUnitPrice,
          unitCost,
        }),
      );
    }

    request.items = itemEntities;
    return this.requestRepo.save(request);
  }

  // ─── Debtor: view incoming consignments ────────────────────────────────────

  async findIncoming(debtorId: string): Promise<ConsignmentRequest[]> {
    return this.requestRepo.find({
      where: { debtorId },
      relations: { supplier: true, items: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Supplier: view outgoing consignments ──────────────────────────────────

  async findOutgoing(supplierId: string): Promise<ConsignmentRequest[]> {
    return this.requestRepo.find({
      where: { supplierId },
      relations: { debtor: true, items: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Debtor: confirm reception (atomic) ───────────────────────────────────

  async confirm(requestId: string, debtorId: string): Promise<ConsignmentRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: { items: true },
    });

    if (!request) throw new NotFoundException('Consignment request not found');
    if (request.debtorId !== debtorId) throw new ForbiddenException('This consignment is not addressed to you');
    if (request.status !== ConsignmentStatus.PENDING) {
      throw new BadRequestException(`Cannot confirm a consignment with status: ${request.status}`);
    }

    return this.dataSource.transaction(async (manager) => {
      for (const item of request.items) {
        // Hard-validate stock (race-condition safe, inside transaction)
        const stockEntries = await manager.find(InventoryEntry, {
          where: [
            { ownerId: request.supplierId, productName: ILike(item.productName), source: InventorySource.SUPPLIER },
            { ownerId: request.supplierId, productName: ILike(item.productName), source: InventorySource.PERSONAL },
          ],
          order: { createdAt: 'ASC' },
        });

        const sorted = [
          ...stockEntries.filter((e) => e.source === InventorySource.SUPPLIER),
          ...stockEntries.filter((e) => e.source === InventorySource.PERSONAL),
        ].filter((e) => e.quantityRemaining > 0);

        const totalAvailable = sorted.reduce((sum, e) => sum + e.quantityRemaining, 0);
        if (totalAvailable < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${item.productName}". Available: ${totalAvailable}, requested: ${item.quantity}`,
          );
        }

        // Deduct from supplier's stock (SUPPLIER-first priority) — emit CONSIGN_OUT per source lot
        let remaining = item.quantity;
        for (const entry of sorted) {
          if (remaining === 0) break;
          const deduct = Math.min(entry.quantityRemaining, remaining);
          const qtyBeforeDeduct = entry.quantityRemaining;
          entry.quantityRemaining -= deduct;
          remaining -= deduct;
          await manager.save(InventoryEntry, entry);

          await this.stockMovements.record(manager, {
            ownerId: request.supplierId,
            entry,
            reason: StockMovementReason.CONSIGN_OUT,
            qty: deduct,
            qtyBefore: qtyBeforeDeduct,
            consignmentRequestId: request.id,
          });
        }

        const creditValue = new Decimal(item.agreedUnitPrice).mul(item.quantity).toFixed(2);

        // Upsert DebtorCredit (supplier=owner, debtor=debtorUser)
        let credit = await manager.findOne(DebtorCredit, {
          where: { ownerId: request.supplierId, debtorUserId: request.debtorId },
        });

        if (!credit) {
          credit = manager.create(DebtorCredit, {
            ownerId: request.supplierId,
            debtorUserId: request.debtorId,
            totalCreditGiven: creditValue,
            totalReceived: '0.00',
            outstandingBalance: creditValue,
          });
        } else {
          credit.totalCreditGiven = new Decimal(credit.totalCreditGiven).plus(creditValue).toFixed(2);
          credit.outstandingBalance = new Decimal(credit.outstandingBalance).plus(creditValue).toFixed(2);
        }
        const savedCredit = await manager.save(DebtorCredit, credit);

        // Upsert SupplierDebt (debtor=owner, supplier=supplierUser) — mirror of DebtorCredit
        let debt = await manager.findOne(SupplierDebt, {
          where: { ownerId: request.debtorId, supplierUserId: request.supplierId },
        });
        if (!debt) {
          debt = manager.create(SupplierDebt, {
            ownerId: request.debtorId,
            supplierUserId: request.supplierId,
            totalCreditReceived: creditValue,
            totalPaid: '0.00',
            outstandingBalance: creditValue,
          });
        } else {
          debt.totalCreditReceived = new Decimal(debt.totalCreditReceived).plus(creditValue).toFixed(2);
          debt.outstandingBalance  = new Decimal(debt.outstandingBalance).plus(creditValue).toFixed(2);
        }
        const savedDebt = await manager.save(SupplierDebt, debt);

        // Create CONSIGNED_OUT entry on supplier's books
        const supplierEntry = manager.create(InventoryEntry, {
          ownerId: request.supplierId,
          source: InventorySource.CONSIGNED_OUT,
          productName: item.productName,
          unitCost: item.unitCost,
          sellingPrice: item.agreedUnitPrice,
          category: null,
          quantityOriginal: item.quantity,
          quantityRemaining: item.quantity,
          debtorUserId: request.debtorId,
          debtorCreditId: savedCredit.id,
        });
        await manager.save(InventoryEntry, supplierEntry);

        // Create CONSIGNED_IN entry on debtor's books.
        // unitCost = agreedUnitPrice (what the debtor owes the supplier per unit — their cost).
        // sellingPrice defaults to agreedUnitPrice; debtor can raise it later to earn a margin.
        const debtorEntry = manager.create(InventoryEntry, {
          ownerId: request.debtorId,
          source: InventorySource.CONSIGNED_IN,
          productName: item.productName,
          unitCost: item.agreedUnitPrice,
          sellingPrice: item.agreedUnitPrice,
          category: null,
          quantityOriginal: item.quantity,
          quantityRemaining: item.quantity,
          supplierUserId: request.supplierId,
          supplierDebtId: savedDebt.id,
        });
        await manager.save(InventoryEntry, debtorEntry);
      }

      // Mark request as accepted
      request.status = ConsignmentStatus.ACCEPTED;
      request.confirmedAt = new Date();
      return manager.save(ConsignmentRequest, request);
    });
  }

  // ─── Debtor: reject consignment ────────────────────────────────────────────

  async reject(requestId: string, debtorId: string): Promise<ConsignmentRequest> {
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Consignment request not found');
    if (request.debtorId !== debtorId) throw new ForbiddenException('This consignment is not addressed to you');
    if (request.status !== ConsignmentStatus.PENDING) {
      throw new BadRequestException(`Cannot reject a consignment with status: ${request.status}`);
    }

    request.status = ConsignmentStatus.REJECTED;
    return this.requestRepo.save(request);
  }

  // ─── Supplier: cancel pending consignment ──────────────────────────────────

  async cancel(requestId: string, supplierId: string): Promise<ConsignmentRequest> {
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Consignment request not found');
    if (request.supplierId !== supplierId) throw new ForbiddenException('You did not send this consignment');
    if (request.status !== ConsignmentStatus.PENDING) {
      throw new BadRequestException(`Cannot cancel a consignment with status: ${request.status}`);
    }

    request.status = ConsignmentStatus.CANCELLED;
    return this.requestRepo.save(request);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Count total available stock (SUPPLIER + PERSONAL) for a given owner and product */
  async countAvailableStock(ownerId: string, productName: string): Promise<number> {
    const entries = await this.entryRepo.find({
      where: [
        { ownerId, productName: ILike(productName.trim().toLowerCase()), source: InventorySource.SUPPLIER },
        { ownerId, productName: ILike(productName.trim().toLowerCase()), source: InventorySource.PERSONAL },
      ],
    });
    return entries.reduce((sum, e) => sum + e.quantityRemaining, 0);
  }

  /** Get stock entries sorted SUPPLIER-first, then PERSONAL, oldest first */
  private async getStockEntriesSorted(ownerId: string, productName: string): Promise<InventoryEntry[]> {
    const entries = await this.entryRepo.find({
      where: [
        { ownerId, productName: ILike(productName.trim().toLowerCase()), source: InventorySource.SUPPLIER },
        { ownerId, productName: ILike(productName.trim().toLowerCase()), source: InventorySource.PERSONAL },
      ],
      order: { createdAt: 'ASC' },
    });
    return [
      ...entries.filter((e) => e.source === InventorySource.SUPPLIER),
      ...entries.filter((e) => e.source === InventorySource.PERSONAL),
    ].filter((e) => e.quantityRemaining > 0);
  }

  /** Count pending incoming consignments for a debtor (used by dashboard alerts) */
  async countPendingIncoming(debtorId: string): Promise<number> {
    return this.requestRepo.count({
      where: { debtorId, status: ConsignmentStatus.PENDING },
    });
  }
}
