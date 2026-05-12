import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  ConsignmentItem,
  Expense,
  ExternalContact,
  ExternalTransaction,
  ExternalTransactionType,
  InventoryEntry,
  InventorySource,
  Payment,
  PaymentDirection,
  SaleTransaction,
  User,
} from '../entities';
import { ALL_ACTIVITY_LOG_TYPES, ActivityLogType, ListActivityLogsDto } from './dto/list-activity-logs.dto';

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  timestamp: string;
  actor: { id: string; username: string } | null;
  summary: string;
  amount: string | null;
  productName: string | null;
  resourceId: string;
  resourceType: 'sale' | 'consignment_item' | 'external_transaction' | 'payment' | 'expense' | 'inventory_entry';
}

export interface ActivityLogsResult {
  data: ActivityLogEntry[];
  total: number;
  byType: Partial<Record<ActivityLogType, number>>;
}

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectRepository(SaleTransaction) private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(ConsignmentItem) private readonly itemRepo: Repository<ConsignmentItem>,
    @InjectRepository(ExternalTransaction) private readonly extTxRepo: Repository<ExternalTransaction>,
    @InjectRepository(ExternalContact) private readonly contactRepo: Repository<ExternalContact>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(InventoryEntry) private readonly entryRepo: Repository<InventoryEntry>,
  ) {}

  async findAll(ownerId: string, query: ListActivityLogsDto): Promise<ActivityLogsResult> {
    const types = query.actionTypes && query.actionTypes.length > 0 ? query.actionTypes : ALL_ACTIVITY_LOG_TYPES;
    const range = this.dateRange(query);

    const fetchers: Promise<ActivityLogEntry[]>[] = [];
    if (types.includes(ActivityLogType.SALE)) fetchers.push(this.loadSales(ownerId, query.actorId, range));
    if (types.includes(ActivityLogType.CONSIGNMENT)) fetchers.push(this.loadConsignmentItems(ownerId, query.actorId, range));
    if (types.includes(ActivityLogType.EXTERNAL_PRODUCT_OUT) ||
        types.includes(ActivityLogType.EXTERNAL_PAYMENT_IN) ||
        types.includes(ActivityLogType.EXTERNAL_PRODUCT_IN) ||
        types.includes(ActivityLogType.EXTERNAL_PAYMENT_OUT)) {
      fetchers.push(this.loadExternalTransactions(ownerId, query.actorId, range, types));
    }
    if (types.includes(ActivityLogType.PAYMENT_TO_SUPPLIER) ||
        types.includes(ActivityLogType.PAYMENT_FROM_DEBTOR)) {
      fetchers.push(this.loadPayments(ownerId, query.actorId, range, types));
    }
    if (types.includes(ActivityLogType.EXPENSE)) fetchers.push(this.loadExpenses(ownerId, query.actorId, range));
    if (types.includes(ActivityLogType.INVENTORY_PERSONAL_ADDED) ||
        types.includes(ActivityLogType.INVENTORY_RECEIVED_FROM_SUPPLIER)) {
      fetchers.push(this.loadInventoryRegistrations(ownerId, query.actorId, range, types));
    }

    const buckets = await Promise.all(fetchers);
    const merged = buckets.flat().sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const byType: Partial<Record<ActivityLogType, number>> = {};
    for (const entry of merged) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    }

    const total = merged.length;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const data = merged.slice((page - 1) * limit, page * limit);

    return { data, total, byType };
  }

  // ─── Per-source loaders ───────────────────────────────────────────────────

  private async loadSales(
    ownerId: string,
    actorId: string | undefined,
    range: { from: Date | null; to: Date | null },
  ): Promise<ActivityLogEntry[]> {
    const where = this.applyDate({ ownerId, ...(actorId ? { actorId } : {}) }, 'date', range);
    const rows = await this.saleRepo.find({
      where: where as FindOptionsWhere<SaleTransaction>,
      relations: { actor: true },
      order: { date: 'DESC' },
    });
    return rows.map((s) => ({
      id: `sale:${s.id}`,
      type: ActivityLogType.SALE,
      timestamp: s.date.toISOString(),
      actor: s.actor ? { id: s.actor.id, username: s.actor.username } : null,
      summary: `Sold ${s.qtySold}× ${cap(s.productName)} @ ${s.salePrice}${
        s.isLoss ? ' (loss)' : ''
      }`,
      amount: String(Number(s.salePrice) * s.qtySold),
      productName: s.productName,
      resourceId: s.id,
      resourceType: 'sale',
    }));
  }

  private async loadConsignmentItems(
    ownerId: string,
    actorId: string | undefined,
    range: { from: Date | null; to: Date | null },
  ): Promise<ActivityLogEntry[]> {
    // ConsignmentItem doesn't carry the supplierId directly — join via the request.
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.actor', 'actor')
      .leftJoinAndSelect('item.consignmentRequest', 'req')
      .leftJoinAndSelect('req.debtor', 'debtor')
      .where('req.supplierId = :ownerId', { ownerId });
    if (actorId) qb.andWhere('item.actor_id = :actorId', { actorId });
    if (range.from) qb.andWhere('req.createdAt >= :from', { from: range.from });
    if (range.to) qb.andWhere('req.createdAt <= :to', { to: range.to });
    qb.orderBy('req.createdAt', 'DESC');
    const rows = await qb.getMany();
    return rows.map((it) => ({
      id: `consignment_item:${it.id}`,
      type: ActivityLogType.CONSIGNMENT,
      timestamp: it.consignmentRequest.createdAt.toISOString(),
      actor: it.actor ? { id: it.actor.id, username: it.actor.username } : null,
      summary: `Consigned ${it.quantity}× ${cap(it.productName)} @ ${it.agreedUnitPrice} to @${
        it.consignmentRequest.debtor?.username ?? 'debtor'
      }`,
      amount: String(Number(it.agreedUnitPrice) * it.quantity),
      productName: it.productName,
      resourceId: it.consignmentRequestId,
      resourceType: 'consignment_item',
    }));
  }

  private async loadExternalTransactions(
    ownerId: string,
    actorId: string | undefined,
    range: { from: Date | null; to: Date | null },
    types: ActivityLogType[],
  ): Promise<ActivityLogEntry[]> {
    const txTypes: ExternalTransactionType[] = [];
    if (types.includes(ActivityLogType.EXTERNAL_PRODUCT_OUT)) txTypes.push(ExternalTransactionType.PRODUCT_OUT);
    if (types.includes(ActivityLogType.EXTERNAL_PAYMENT_IN)) txTypes.push(ExternalTransactionType.PAYMENT_IN);
    if (types.includes(ActivityLogType.EXTERNAL_PRODUCT_IN)) txTypes.push(ExternalTransactionType.PRODUCT_IN);
    if (types.includes(ActivityLogType.EXTERNAL_PAYMENT_OUT)) txTypes.push(ExternalTransactionType.PAYMENT_OUT);
    if (txTypes.length === 0) return [];

    const qb = this.extTxRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.actor', 'actor')
      .leftJoinAndSelect('tx.contact', 'contact')
      .where('tx.ownerId = :ownerId', { ownerId })
      .andWhere('tx.type IN (:...txTypes)', { txTypes });
    if (actorId) qb.andWhere('tx.actor_id = :actorId', { actorId });
    if (range.from) qb.andWhere('tx.createdAt >= :from', { from: range.from });
    if (range.to) qb.andWhere('tx.createdAt <= :to', { to: range.to });
    qb.orderBy('tx.createdAt', 'DESC');
    const rows = await qb.getMany();

    return rows.map((tx) => ({
      id: `external_tx:${tx.id}`,
      type: extToActivity(tx.type),
      timestamp: tx.createdAt.toISOString(),
      actor: tx.actor ? { id: tx.actor.id, username: tx.actor.username } : null,
      summary: extSummary(tx),
      amount: tx.amount,
      productName: tx.productName,
      resourceId: tx.contactId,
      resourceType: 'external_transaction',
    }));
  }

  private async loadPayments(
    ownerId: string,
    actorId: string | undefined,
    range: { from: Date | null; to: Date | null },
    types: ActivityLogType[],
  ): Promise<ActivityLogEntry[]> {
    const directions: PaymentDirection[] = [];
    if (types.includes(ActivityLogType.PAYMENT_TO_SUPPLIER)) directions.push(PaymentDirection.OWNER_TO_SUPPLIER);
    if (types.includes(ActivityLogType.PAYMENT_FROM_DEBTOR)) directions.push(PaymentDirection.DEBTOR_TO_OWNER);
    if (directions.length === 0) return [];

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.actor', 'actor')
      .leftJoinAndSelect('p.paidByUser', 'paidByUser')
      .leftJoinAndSelect('p.paidToUser', 'paidToUser')
      .where('p.direction IN (:...directions)', { directions })
      // Only payments that represent an action ON THIS owner's books.
      .andWhere(
        '((p.direction = :outDir AND p.paid_by_user_id = :ownerId) OR (p.direction = :inDir AND p.paid_to_user_id = :ownerId))',
        {
          outDir: PaymentDirection.OWNER_TO_SUPPLIER,
          inDir: PaymentDirection.DEBTOR_TO_OWNER,
          ownerId,
        },
      );
    if (actorId) qb.andWhere('p.actor_id = :actorId', { actorId });
    if (range.from) qb.andWhere('p.created_at >= :from', { from: range.from });
    if (range.to) qb.andWhere('p.created_at <= :to', { to: range.to });
    qb.orderBy('p.created_at', 'DESC');
    const rows = await qb.getMany();

    return rows.map((p): ActivityLogEntry => {
      const isOut = p.direction === PaymentDirection.OWNER_TO_SUPPLIER;
      return {
        id: `payment:${p.id}`,
        type: isOut ? ActivityLogType.PAYMENT_TO_SUPPLIER : ActivityLogType.PAYMENT_FROM_DEBTOR,
        timestamp: p.date.toISOString(),
        actor: p.actor ? { id: p.actor.id, username: p.actor.username } : null,
        summary: isOut
          ? `Submitted ${p.amount} payment to @${p.paidToUser?.username ?? 'supplier'} (${p.status})`
          : `Recorded ${p.amount} received from @${p.paidByUser?.username ?? 'debtor'}`,
        amount: p.amount,
        productName: null,
        resourceId: p.id,
        resourceType: 'payment',
      };
    });
  }

  private async loadExpenses(
    ownerId: string,
    actorId: string | undefined,
    range: { from: Date | null; to: Date | null },
  ): Promise<ActivityLogEntry[]> {
    const where: FindOptionsWhere<Expense> = { ownerId };
    if (actorId) where.actorId = actorId;
    this.applyDate(where as Record<string, unknown>, 'date', range);
    const rows = await this.expenseRepo.find({
      where,
      relations: { actor: true },
      order: { date: 'DESC' },
    });
    return rows.map((e) => ({
      id: `expense:${e.id}`,
      type: ActivityLogType.EXPENSE,
      timestamp: e.date.toISOString(),
      actor: e.actor ? { id: e.actor.id, username: e.actor.username } : null,
      summary: `${e.category}: ${e.amount} ${e.currency}${e.description ? ` — ${e.description}` : ''}`,
      amount: e.amount,
      productName: null,
      resourceId: e.id,
      resourceType: 'expense',
    }));
  }

  private async loadInventoryRegistrations(
    ownerId: string,
    actorId: string | undefined,
    range: { from: Date | null; to: Date | null },
    types: ActivityLogType[],
  ): Promise<ActivityLogEntry[]> {
    const sources: InventorySource[] = [];
    if (types.includes(ActivityLogType.INVENTORY_PERSONAL_ADDED)) sources.push(InventorySource.PERSONAL);
    if (types.includes(ActivityLogType.INVENTORY_RECEIVED_FROM_SUPPLIER)) sources.push(InventorySource.SUPPLIER);
    if (sources.length === 0) return [];

    const qb = this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.actor', 'actor')
      .leftJoinAndSelect('e.supplierUser', 'supplier')
      .where('e.ownerId = :ownerId', { ownerId })
      .andWhere('e.source IN (:...sources)', { sources });
    if (actorId) qb.andWhere('e.actor_id = :actorId', { actorId });
    if (range.from) qb.andWhere('e.createdAt >= :from', { from: range.from });
    if (range.to) qb.andWhere('e.createdAt <= :to', { to: range.to });
    qb.orderBy('e.createdAt', 'DESC');
    const rows = await qb.getMany();

    return rows.map((e) => ({
      id: `inventory:${e.id}`,
      type: e.source === InventorySource.PERSONAL
        ? ActivityLogType.INVENTORY_PERSONAL_ADDED
        : ActivityLogType.INVENTORY_RECEIVED_FROM_SUPPLIER,
      timestamp: e.createdAt.toISOString(),
      actor: e.actor ? { id: e.actor.id, username: e.actor.username } : null,
      summary: e.source === InventorySource.PERSONAL
        ? `Added ${e.quantityOriginal}× ${cap(e.productName)} to personal stock @ ${e.unitCost}`
        : `Received ${e.quantityOriginal}× ${cap(e.productName)} from @${e.supplierUser?.username ?? 'supplier'} @ ${e.unitCost}`,
      amount: String(Number(e.unitCost) * e.quantityOriginal),
      productName: e.productName,
      resourceId: e.id,
      resourceType: 'inventory_entry',
    }));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private dateRange(query: ListActivityLogsDto): { from: Date | null; to: Date | null } {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to + 'T23:59:59.999Z') : null;
    return { from, to };
  }

  private applyDate<T extends Record<string, unknown>>(
    where: T,
    field: string,
    range: { from: Date | null; to: Date | null },
  ): T {
    if (range.from && range.to) (where as Record<string, unknown>)[field] = Between(range.from, range.to);
    else if (range.from) (where as Record<string, unknown>)[field] = MoreThanOrEqual(range.from);
    else if (range.to) (where as Record<string, unknown>)[field] = LessThanOrEqual(range.to);
    return where;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extToActivity(t: ExternalTransactionType): ActivityLogType {
  switch (t) {
    case ExternalTransactionType.PRODUCT_OUT: return ActivityLogType.EXTERNAL_PRODUCT_OUT;
    case ExternalTransactionType.PAYMENT_IN: return ActivityLogType.EXTERNAL_PAYMENT_IN;
    case ExternalTransactionType.PRODUCT_IN: return ActivityLogType.EXTERNAL_PRODUCT_IN;
    case ExternalTransactionType.PAYMENT_OUT: return ActivityLogType.EXTERNAL_PAYMENT_OUT;
  }
}

function extSummary(tx: ExternalTransaction & { contact?: ExternalContact }): string {
  const contactName = tx.contact?.name ?? 'external contact';
  switch (tx.type) {
    case ExternalTransactionType.PRODUCT_OUT:
      return `Gave ${tx.quantity ?? '?'}× ${cap(tx.productName ?? '')} @ ${tx.unitPrice ?? tx.amount} to ${contactName}`;
    case ExternalTransactionType.PAYMENT_IN:
      return `Received ${tx.amount} cash from ${contactName}`;
    case ExternalTransactionType.PRODUCT_IN:
      return `Received ${tx.quantity ?? '?'}× ${cap(tx.productName ?? '')} @ ${tx.unitPrice ?? tx.amount} from ${contactName}`;
    case ExternalTransactionType.PAYMENT_OUT:
      return `Paid ${tx.amount} to ${contactName}`;
  }
}
