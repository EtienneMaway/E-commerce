import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  InventoryEntry,
  POSITIVE_REASONS,
  StockMovement,
  StockMovementReason,
} from '../entities';
import { StockMovementsFilterDto } from './dto/stock-movements-filter.dto';

export interface RecordMovementInput {
  ownerId: string;
  entry: InventoryEntry;
  reason: StockMovementReason;
  /**
   * Always positive — this method derives the sign from `reason`.
   * Callers that already know the signed delta (e.g. SALE deducts) can pass
   * the absolute number; the method will negate it for negative reasons.
   */
  qty: number;
  qtyBefore: number;
  notes?: string | null;
  saleTransactionId?: string | null;
  consignmentRequestId?: string | null;
  supplierDebtId?: string | null;
}

@Injectable()
export class StockMovementsService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly repo: Repository<StockMovement>,
  ) {}

  /**
   * Record a movement INSIDE the caller's existing transaction.
   * Never opens its own transaction — atomicity is the caller's responsibility.
   */
  async record(
    manager: EntityManager,
    input: RecordMovementInput,
  ): Promise<StockMovement> {
    const sign = POSITIVE_REASONS.has(input.reason) ? 1 : -1;
    const qtyDelta = sign * Math.abs(input.qty);
    const qtyAfter = input.qtyBefore + qtyDelta;

    const movement = manager.create(StockMovement, {
      ownerId: input.ownerId,
      inventoryEntryId: input.entry.id,
      reason: input.reason,
      qtyDelta,
      qtyBefore: input.qtyBefore,
      qtyAfter,
      unitCostSnapshot: input.entry.unitCost,
      notes: input.notes ?? null,
      saleTransactionId: input.saleTransactionId ?? null,
      consignmentRequestId: input.consignmentRequestId ?? null,
      supplierDebtId: input.supplierDebtId ?? null,
    });
    return manager.save(StockMovement, movement);
  }

  async findAll(
    ownerId: string,
    filter: StockMovementsFilterDto,
  ): Promise<{ data: StockMovement[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.inventoryEntry', 'entry')
      .where('m.ownerId = :ownerId', { ownerId })
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filter.entryId) {
      qb.andWhere('m.inventoryEntryId = :entryId', { entryId: filter.entryId });
    }

    if (filter.productName) {
      qb.andWhere('entry.productName ILIKE :name', {
        name: `%${filter.productName.trim().toLowerCase()}%`,
      });
    }

    if (filter.reason && filter.reason.length > 0) {
      // Support comma-separated string from query string
      const reasons = Array.isArray(filter.reason)
        ? filter.reason
        : String(filter.reason).split(',');
      qb.andWhere('m.reason IN (:...reasons)', { reasons });
    }

    if (filter.source) {
      qb.andWhere('entry.source = :source', { source: filter.source });
    }

    if (filter.dateFrom) {
      qb.andWhere('m.createdAt >= :from', { from: new Date(filter.dateFrom) });
    }
    if (filter.dateTo) {
      qb.andWhere('m.createdAt <= :to', {
        to: new Date(filter.dateTo + 'T23:59:59'),
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findByEntry(
    ownerId: string,
    entryId: string,
  ): Promise<StockMovement[]> {
    return this.repo.find({
      where: { ownerId, inventoryEntryId: entryId },
      order: { createdAt: 'DESC' },
    });
  }
}
