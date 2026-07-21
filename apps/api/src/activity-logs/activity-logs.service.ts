import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  ConsignmentItem,
  Expense,
  ExternalContact,
  ExternalTransaction,
  ExternalTransactionType,
  InventoryEntry,
  InventorySource,
  MiniSettlement,
  Payment,
  PaymentDirection,
  SaleTransaction,
  User,
} from '../entities';
import { ALL_ACTIVITY_LOG_TYPES, ActivityLogType, ListActivityLogsDto } from './dto/list-activity-logs.dto';
import type { ActorContext } from '../common/types/actor-context';
import {
  actorCondToWhereValue,
  applyActorCondToQb,
  resolveActorFilter,
  type ActorCond,
} from '../common/actor-filter';

/**
 * Per-source row cap for the merged activity feed.
 *
 * This endpoint fans out to six tables, merges in Node, sorts, then slices one
 * page. Every loader was previously UNBOUNDED — `loadSales` alone pulled every
 * sale row ever written (with its actor relation) to render ten entries, so
 * page 1 cost exactly as much as page 500 and the cost grew forever with
 * history. On a slow link that is also a large response to compress and ship.
 *
 * Trade-off, stated plainly: `total` and `byType` are computed from the merged
 * set, so once a single source exceeds this cap those counts under-report and
 * the feed shows "the most recent N per source" rather than all history. That
 * is the right behaviour for an activity feed, and it only diverges at volumes
 * where the previous implementation would have been unusably slow anyway. If
 * exact lifetime totals are ever needed, they should come from dedicated
 * COUNT(*) queries rather than by loading every row.
 */
const MAX_ROWS_PER_SOURCE = 2000;

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  timestamp: string;
  actor: { id: string; username: string } | null;
  summary: string;
  amount: string | null;
  productName: string | null;
  resourceId: string;
  resourceType:
    | 'sale'
    | 'consignment_item'
    | 'external_transaction'
    | 'payment'
    | 'expense'
    | 'inventory_entry'
    | 'mini_settlement';
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
    @InjectRepository(MiniSettlement) private readonly settlementRepo: Repository<MiniSettlement>,
  ) {}

  async findAll(ctx: ActorContext, query: ListActivityLogsDto): Promise<ActivityLogsResult> {
    const ownerId = ctx.effectiveOwnerId;
    const actor = resolveActorFilter(query.actorId, ctx);
    const types = query.actionTypes && query.actionTypes.length > 0 ? query.actionTypes : ALL_ACTIVITY_LOG_TYPES;
    const range = this.dateRange(query);

    const fetchers: Promise<ActivityLogEntry[]>[] = [];
    if (types.includes(ActivityLogType.SALE)) fetchers.push(this.loadSales(ownerId, actor, range));
    if (types.includes(ActivityLogType.CONSIGNMENT)) fetchers.push(this.loadConsignmentItems(ownerId, actor, range));
    if (types.includes(ActivityLogType.EXTERNAL_PRODUCT_OUT) ||
        types.includes(ActivityLogType.EXTERNAL_PAYMENT_IN) ||
        types.includes(ActivityLogType.EXTERNAL_PRODUCT_IN) ||
        types.includes(ActivityLogType.EXTERNAL_PAYMENT_OUT)) {
      fetchers.push(this.loadExternalTransactions(ownerId, actor, range, types));
    }
    // HANDOVER is served by loadPayments too — an approved handover IS a
    // DEBTOR_TO_OWNER payment — so filtering to handovers alone must still
    // reach this loader.
    if (types.includes(ActivityLogType.PAYMENT_TO_SUPPLIER) ||
        types.includes(ActivityLogType.PAYMENT_FROM_DEBTOR) ||
        types.includes(ActivityLogType.HANDOVER)) {
      fetchers.push(this.loadPayments(ownerId, actor, range, types));
    }
    if (types.includes(ActivityLogType.EXPENSE)) fetchers.push(this.loadExpenses(ownerId, actor, range));
    if (types.includes(ActivityLogType.INVENTORY_PERSONAL_ADDED) ||
        types.includes(ActivityLogType.INVENTORY_RECEIVED_FROM_SUPPLIER)) {
      fetchers.push(this.loadInventoryRegistrations(ownerId, actor, range, types));
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
    actor: ActorCond | null,
    range: { from: Date | null; to: Date | null },
  ): Promise<ActivityLogEntry[]> {
    const actorWhere = actorCondToWhereValue(actor);
    const where = this.applyDate({ ownerId, ...(actorWhere !== undefined ? { actorId: actorWhere } : {}) }, 'date', range);
    const rows = await this.saleRepo.find({
      where: where as FindOptionsWhere<SaleTransaction>,
      relations: { actor: true },
      order: { date: 'DESC' },
      take: MAX_ROWS_PER_SOURCE,
    });
    return rows.map((s) => ({
      id: `sale:${s.id}`,
      type: ActivityLogType.SALE,
      timestamp: s.date.toISOString(),
      actor: s.actor ? { id: s.actor.id, username: s.actor.username } : null,
      summary: `Sold ${s.qtySold}× ${cap(s.productName)}${
        s.variantLabel ? ` (${s.variantLabel})` : ''
      } @ ${s.salePrice}${s.isLoss ? ' (loss)' : ''}`,
      amount: String(Number(s.salePrice) * s.qtySold),
      productName: s.productName,
      resourceId: s.id,
      resourceType: 'sale',
    }));
  }

  private async loadConsignmentItems(
    ownerId: string,
    actor: ActorCond | null,
    range: { from: Date | null; to: Date | null },
  ): Promise<ActivityLogEntry[]> {
    // ConsignmentItem doesn't carry the supplierId directly — join via the request.
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.actor', 'actor')
      .leftJoinAndSelect('item.consignmentRequest', 'req')
      .leftJoinAndSelect('req.debtor', 'debtor')
      .where('req.supplierId = :ownerId', { ownerId });
    applyActorCondToQb(qb, 'item.actor_id', actor);
    if (range.from) qb.andWhere('req.createdAt >= :from', { from: range.from });
    if (range.to) qb.andWhere('req.createdAt <= :to', { to: range.to });
    qb.orderBy('req.createdAt', 'DESC').take(MAX_ROWS_PER_SOURCE);
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
    actor: ActorCond | null,
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
    applyActorCondToQb(qb, 'tx.actor_id', actor);
    if (range.from) qb.andWhere('tx.createdAt >= :from', { from: range.from });
    if (range.to) qb.andWhere('tx.createdAt <= :to', { to: range.to });
    qb.orderBy('tx.createdAt', 'DESC').take(MAX_ROWS_PER_SOURCE);
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

  /**
   * Map payment id → the approved handover that booked it.
   *
   * Only approved handovers have a payment at all (mini-settlements.service
   * creates it inside the approval transaction, and only when cash > 0), so
   * this needs no status filter: a pending or rejected handover simply has no
   * payment to match, and a handover of pure returns with nothing sold has no
   * cash and therefore no entry — which is correct, since nothing was sold.
   */
  private async handoversByPaymentId(
    paymentIds: string[],
  ): Promise<Map<string, MiniSettlement>> {
    if (paymentIds.length === 0) return new Map();
    const rows = await this.settlementRepo.find({
      where: { paymentId: In(paymentIds) },
    });
    return new Map(rows.map((s) => [s.paymentId as string, s]));
  }

  private async loadPayments(
    ownerId: string,
    actor: ActorCond | null,
    range: { from: Date | null; to: Date | null },
    types: ActivityLogType[],
  ): Promise<ActivityLogEntry[]> {
    const directions: PaymentDirection[] = [];
    if (types.includes(ActivityLogType.PAYMENT_TO_SUPPLIER)) directions.push(PaymentDirection.OWNER_TO_SUPPLIER);
    // HANDOVER entries are DEBTOR_TO_OWNER payments too, so asking for either
    // type has to pull that direction; the mapping below sorts them apart.
    if (types.includes(ActivityLogType.PAYMENT_FROM_DEBTOR) || types.includes(ActivityLogType.HANDOVER)) {
      directions.push(PaymentDirection.DEBTOR_TO_OWNER);
    }
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
    applyActorCondToQb(qb, 'p.actor_id', actor);
    if (range.from) qb.andWhere('p.created_at >= :from', { from: range.from });
    if (range.to) qb.andWhere('p.created_at <= :to', { to: range.to });
    // `p.date` (the entity property) not `p.created_at` (the column). Every
    // other loader here already orders by the property; this one did not, and
    // because `take()` makes TypeORM build a distinct-id subquery it has to map
    // the ordering back to a property — an unmappable raw column threw
    // "Cannot read properties of undefined (reading 'databaseName')" and 500'd
    // the whole endpoint for any owner with payments.
    qb.orderBy('p.date', 'DESC').take(MAX_ROWS_PER_SOURCE);
    const rows = await qb.getMany();

    // Which of these payments were booked by a mini-employee handover.
    const handovers = await this.handoversByPaymentId(rows.map((p) => p.id));

    const entries = rows.map((p): ActivityLogEntry => {
      const isOut = p.direction === PaymentDirection.OWNER_TO_SUPPLIER;
      const handover = handovers.get(p.id);

      // A handover payment is reported as the handover it came from, not as a
      // generic debtor payment — same row, same money, one entry. The amount is
      // the settlement's cash, i.e. what the mini SOLD; the unsold goods they
      // returned are deliberately not represented here.
      if (handover) {
        return {
          id: `mini_settlement:${handover.id}`,
          type: ActivityLogType.HANDOVER,
          timestamp: p.date.toISOString(),
          actor: p.actor ? { id: p.actor.id, username: p.actor.username } : null,
          summary: `Handover by @${p.paidByUser?.username ?? 'employee'} — ${handover.cashAmount} for goods sold`,
          amount: handover.cashAmount,
          productName: null,
          // Points at the settlement so a client can open the handover itself
          // (with its returned-items breakdown) rather than the payment row.
          resourceId: handover.id,
          resourceType: 'mini_settlement',
        };
      }

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

    // The direction filter above is deliberately broad (HANDOVER and
    // PAYMENT_FROM_DEBTOR share a direction), so drop anything the caller did
    // not actually ask for.
    return entries.filter((e) => types.includes(e.type));
  }

  private async loadExpenses(
    ownerId: string,
    actor: ActorCond | null,
    range: { from: Date | null; to: Date | null },
  ): Promise<ActivityLogEntry[]> {
    const where: FindOptionsWhere<Expense> = { ownerId };
    const actorWhere = actorCondToWhereValue(actor);
    if (actorWhere !== undefined) where.actorId = actorWhere;
    this.applyDate(where as Record<string, unknown>, 'date', range);
    const rows = await this.expenseRepo.find({
      where,
      relations: { actor: true },
      order: { date: 'DESC' },
      take: MAX_ROWS_PER_SOURCE,
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
    actor: ActorCond | null,
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
    applyActorCondToQb(qb, 'e.actor_id', actor);
    if (range.from) qb.andWhere('e.createdAt >= :from', { from: range.from });
    if (range.to) qb.andWhere('e.createdAt <= :to', { to: range.to });
    qb.orderBy('e.createdAt', 'DESC').take(MAX_ROWS_PER_SOURCE);
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
