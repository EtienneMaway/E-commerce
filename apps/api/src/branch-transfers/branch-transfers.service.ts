import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Brackets, DataSource, EntityManager, In, IsNull, MoreThan, Repository } from 'typeorm';
import { pageWindow, toPaginated, type Paginated } from '../common/pagination';
import {
  BranchBalance,
  BranchPayment,
  BranchPaymentCurrency,
  BranchPaymentStatus,
  BranchTransfer,
  BranchTransferItem,
  BranchTransferLotDraw,
  BranchTransferStatus,
  InventoryEntry,
  InventorySource,
  ProductGroup,
  ProductPrice,
  ProductVariant,
  Shop,
  StockCustody,
  StockCustodyStatus,
  StockMovementReason,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { requireShop } from '../common/shop-scope';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CurrencyService } from '../currency/currency.service';
import { CreateBranchTransferDto } from './dto/create-branch-transfer.dto';
import { CreateBranchPaymentDto } from './dto/create-branch-payment.dto';
import { ListBranchTransfersDto } from './dto/list-branch-transfers.dto';

/** Sellable shelf sources. A consigned lot never travels between branches. */
const SHELF_SOURCES = [InventorySource.SUPPLIER, InventorySource.PERSONAL];

/** A branch another branch of this business can send to. */
export interface BranchDestination {
  shopId: string;
  name: string;
  isDefault: boolean;
}

/**
 * Who is acting for a branch. Only these two may send, receive, reject, cancel,
 * pay or confirm (`BRANCH_TRANSFER_PLAN.md` §1).
 */
interface BranchActor {
  /** The open custody the actor runs at this branch. Null for the owner. */
  custody: StockCustody | null;
  isOwner: boolean;
}

/**
 * Branch-to-branch stock transfers inside one business, and the inter-branch
 * debt they create. See `BRANCH_TRANSFER_PLAN.md`.
 *
 * The escrow invariant: from the moment a transfer is sent until it is
 * answered, its goods are on **no** shelf. They have left A's lots (recorded
 * draw by draw) and nothing exists at B. Receiving creates B's lots; rejecting
 * or cancelling adds each draw back onto the exact lot it left.
 */
@Injectable()
export class BranchTransfersService {
  constructor(
    @InjectRepository(BranchTransfer)
    private readonly transferRepo: Repository<BranchTransfer>,
    @InjectRepository(BranchBalance)
    private readonly balanceRepo: Repository<BranchBalance>,
    @InjectRepository(BranchPayment)
    private readonly paymentRepo: Repository<BranchPayment>,
    @InjectRepository(StockCustody)
    private readonly custodyRepo: Repository<StockCustody>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
    private readonly currency: CurrencyService,
  ) {}

  // ─── Destinations ──────────────────────────────────────────────────────────

  /** The other open branches of this business, to pick a destination from. */
  async destinations(ctx: ActorContext): Promise<BranchDestination[]> {
    if (ctx.shopId) await this.requireBranchActor(ctx, ctx.shopId);
    else this.requireOwner(ctx);
    const shops = await this.shopRepo.find({
      where: { orgId: ctx.orgId, archivedAt: IsNull() },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    return shops
      .filter((s) => s.id !== ctx.shopId)
      .map((s) => ({ shopId: s.id, name: s.name, isDefault: s.isDefault }));
  }

  // ─── Send ──────────────────────────────────────────────────────────────────

  async send(ctx: ActorContext, dto: CreateBranchTransferDto): Promise<BranchTransfer> {
    const fromShopId = requireShop(ctx);
    const actor = await this.requireBranchActor(ctx, fromShopId);

    if (dto.toShopId === fromShopId) {
      throw new BadRequestException('Choose a different branch to send to');
    }
    const toShop = await this.shopRepo.findOne({ where: { id: dto.toShopId, orgId: ctx.orgId } });
    if (!toShop) throw new NotFoundException('Branch not found');
    if (toShop.archivedAt) throw new BadRequestException('That branch is closed');

    // One line per product: two lines for the same lot would draw twice and
    // make the escrow harder to read than it needs to be.
    const seen = new Set<string>();
    for (const item of dto.items) {
      const key = item.variantId ?? item.productName.trim().toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(`"${item.productName}" appears twice — combine the quantities`);
      }
      seen.add(key);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const transfer = manager.create(BranchTransfer, {
        orgId: ctx.orgId,
        fromShopId,
        toShopId: toShop.id,
        status: BranchTransferStatus.IN_TRANSIT,
        sentById: ctx.actorId,
        fromCustodyId: actor.custody?.id ?? null,
        note: dto.note?.trim() || null,
        sentAt: new Date(),
        items: [],
      });
      let total = new Decimal(0);

      for (const line of dto.items) {
        const productName = line.productName.trim().toLowerCase();
        const lots = await this.shelfLots(manager, ctx, fromShopId, actor, productName, line.variantId ?? null);
        const available = lots.reduce((n, l) => n + l.quantityRemaining, 0);
        if (available < line.quantity) {
          throw new BadRequestException(
            `Not enough stock for "${productName}" — available ${available}, requested ${line.quantity}`,
          );
        }

        const draws: BranchTransferLotDraw[] = [];
        let needed = line.quantity;
        let lineValue = new Decimal(0);
        for (const lot of lots) {
          if (needed === 0) break;
          const take = Math.min(needed, lot.quantityRemaining);
          const before = lot.quantityRemaining;
          lot.quantityRemaining = before - take;
          await manager.save(InventoryEntry, lot);
          await this.stockMovements.record(manager, {
            ownerId: lot.ownerId,
            entry: lot,
            reason: StockMovementReason.TRANSFER_OUT,
            qty: take,
            qtyBefore: before,
            notes: `Sent to ${toShop.name}`,
          });
          draws.push(
            manager.create(BranchTransferLotDraw, {
              inventoryEntryId: lot.id,
              quantity: take,
              unitCost: lot.unitCost,
              source: lot.source,
            }),
          );
          lineValue = lineValue.plus(new Decimal(lot.unitCost).mul(take));
          needed -= take;
        }

        const variant = line.variantId
          ? await manager.findOne(ProductVariant, { where: { id: line.variantId } })
          : null;
        transfer.items.push(
          manager.create(BranchTransferItem, {
            // A sized lot is stored under its group's name — keep what the lots say.
            productName: lots[0].productName,
            quantity: line.quantity,
            unitCost: lineValue.div(line.quantity).toFixed(4),
            variantId: line.variantId ?? null,
            variantLabel: variant?.label ?? null,
            piecesPerCarton: lots[0].piecesPerCarton,
            draws,
          }),
        );
        total = total.plus(lineValue);
      }

      transfer.totalValue = total.toFixed(4);
      return manager.save(BranchTransfer, transfer);
    });

    return this.findOne(ctx, saved.id);
  }

  // ─── Receive / reject / cancel ─────────────────────────────────────────────

  /**
   * B takes everything. All or nothing (§8 Q2): there is no partial receipt,
   * so B either verifies the whole transfer or rejects it.
   */
  async receive(ctx: ActorContext, id: string): Promise<BranchTransfer> {
    const toShopId = requireShop(ctx);
    const actor = await this.requireBranchActor(ctx, toShopId);

    await this.dataSource.transaction(async (manager) => {
      const transfer = await this.lockInTransit(manager, ctx, id);
      if (transfer.toShopId !== toShopId) {
        throw new ForbiddenException('This transfer is not addressed to this branch');
      }

      const items = await manager.find(BranchTransferItem, {
        where: { transferId: transfer.id },
        relations: { draws: { inventoryEntry: true } },
      });

      for (const item of items) {
        const landing = await this.landingProduct(manager, transfer, item);
        for (const draw of item.draws) {
          const source = draw.inventoryEntry;
          const lot = await manager.save(
            InventoryEntry,
            manager.create(InventoryEntry, {
              source: draw.source,
              productName: item.productName,
              unitCost: draw.unitCost,
              sellingPrice: landing.sellingPrice ?? source.sellingPrice,
              category: source.category,
              quantityOriginal: draw.quantity,
              quantityRemaining: draw.quantity,
              cartonPrice: source.cartonPrice,
              piecesPerCarton: source.piecesPerCarton,
              usdToFcRateSnapshot: source.usdToFcRateSnapshot,
              // Same business, same owner: the goods never change hands.
              ownerId: source.ownerId,
              orgId: transfer.orgId,
              shopId: toShopId,
              custodianId: actor.custody?.custodianId ?? null,
              // Provenance survives; the external debt does not move. A's
              // supplier is still owed by A, never by B.
              supplierUserId: source.supplierUserId,
              supplierDebtId: null,
              groupId: landing.groupId,
              variantId: landing.variantId,
              actorId: ctx.actorId,
              branchTransferId: transfer.id,
            }),
          );
          await this.stockMovements.record(manager, {
            ownerId: lot.ownerId,
            entry: lot,
            reason: StockMovementReason.TRANSFER_IN,
            qty: draw.quantity,
            qtyBefore: 0,
            notes: `Received from ${transfer.fromShop.name}`,
          });
        }
      }

      // Rule 3's idea for branches: one balance per pair, never a duplicate.
      await manager
        .createQueryBuilder()
        .insert()
        .into(BranchBalance)
        .values({ orgId: transfer.orgId, creditorShopId: transfer.fromShopId, debtorShopId: toShopId })
        .orIgnore()
        .execute();
      const balance = await manager.findOneOrFail(BranchBalance, {
        where: { orgId: transfer.orgId, creditorShopId: transfer.fromShopId, debtorShopId: toShopId },
        lock: { mode: 'pessimistic_write' },
      });
      balance.totalGiven = new Decimal(balance.totalGiven).plus(transfer.totalValue).toFixed(4);
      balance.outstanding = new Decimal(balance.outstanding).plus(transfer.totalValue).toFixed(4);
      await manager.save(BranchBalance, balance);

      transfer.status = BranchTransferStatus.RECEIVED;
      transfer.answeredById = ctx.actorId;
      transfer.answeredAt = new Date();
      transfer.toCustodyId = actor.custody?.id ?? null;
      await manager.save(BranchTransfer, transfer);
    });

    return this.findOne(ctx, id);
  }

  async reject(ctx: ActorContext, id: string, reason: string): Promise<BranchTransfer> {
    const toShopId = requireShop(ctx);
    await this.requireBranchActor(ctx, toShopId);

    await this.dataSource.transaction(async (manager) => {
      const transfer = await this.lockInTransit(manager, ctx, id);
      if (transfer.toShopId !== toShopId) {
        throw new ForbiddenException('This transfer is not addressed to this branch');
      }
      await this.restoreDraws(manager, transfer, `Rejected by ${transfer.toShop.name}`);
      transfer.status = BranchTransferStatus.REJECTED;
      transfer.rejectionReason = reason.trim();
      transfer.answeredById = ctx.actorId;
      transfer.answeredAt = new Date();
      await manager.save(BranchTransfer, transfer);
    });

    return this.findOne(ctx, id);
  }

  async cancel(ctx: ActorContext, id: string): Promise<BranchTransfer> {
    const fromShopId = requireShop(ctx);
    await this.requireBranchActor(ctx, fromShopId);

    await this.dataSource.transaction(async (manager) => {
      const transfer = await this.lockInTransit(manager, ctx, id);
      if (transfer.fromShopId !== fromShopId) {
        throw new ForbiddenException('Only the sending branch can cancel this transfer');
      }
      await this.restoreDraws(manager, transfer, 'Transfer cancelled');
      transfer.status = BranchTransferStatus.CANCELLED;
      transfer.answeredById = ctx.actorId;
      transfer.answeredAt = new Date();
      await manager.save(BranchTransfer, transfer);
    });

    return this.findOne(ctx, id);
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async list(ctx: ActorContext, filter: ListBranchTransfersDto): Promise<BranchTransfer[] | Paginated<BranchTransfer>> {
    if (ctx.shopId) await this.requireBranchActor(ctx, ctx.shopId);
    else this.requireOwner(ctx);

    const qb = this.transferRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fromShop', 'fromShop')
      .leftJoinAndSelect('t.toShop', 'toShop')
      .leftJoinAndSelect('t.items', 'items')
      .leftJoinAndSelect('t.sentBy', 'sentBy')
      .leftJoinAndSelect('t.answeredBy', 'answeredBy')
      .where('t.orgId = :orgId', { orgId: ctx.orgId })
      .orderBy('t.sentAt', 'DESC')
      .addOrderBy('items.productName', 'ASC');

    if (ctx.shopId) {
      if (filter.direction === 'incoming') qb.andWhere('t.toShopId = :shop', { shop: ctx.shopId });
      else if (filter.direction === 'outgoing') qb.andWhere('t.fromShopId = :shop', { shop: ctx.shopId });
      else {
        qb.andWhere(
          new Brackets((w) => {
            w.where('t.fromShopId = :shop', { shop: ctx.shopId }).orWhere('t.toShopId = :shop', {
              shop: ctx.shopId,
            });
          }),
        );
      }
    }
    if (filter.status) qb.andWhere('t.status = :status', { status: filter.status });

    const w = pageWindow(filter);
    if (!w) return qb.take(200).getMany();
    // Paged: TypeORM pages on distinct transfer ids, so the items join can't
    // shrink a page. id breaks ties between transfers sent in the same instant.
    const [rows, total] = await qb.addOrderBy('t.id', 'DESC').skip(w.skip).take(w.take).getManyAndCount();
    return toPaginated(rows, total, w);
  }

  async findOne(ctx: ActorContext, id: string): Promise<BranchTransfer> {
    const transfer = await this.transferRepo.findOne({
      where: { id, orgId: ctx.orgId },
      relations: { fromShop: true, toShop: true, items: true, sentBy: true, answeredBy: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (ctx.shopId) {
      if (transfer.fromShopId !== ctx.shopId && transfer.toShopId !== ctx.shopId) {
        throw new NotFoundException('Transfer not found');
      }
      await this.requireBranchActor(ctx, ctx.shopId);
    } else {
      this.requireOwner(ctx);
    }
    return transfer;
  }

  // ─── Balances and payments ─────────────────────────────────────────────────

  /** What this branch owes and is owed. Every pair in the business under "All branches". */
  async balances(ctx: ActorContext): Promise<BranchBalance[]> {
    if (ctx.shopId) await this.requireBranchActor(ctx, ctx.shopId);
    else this.requireOwner(ctx);
    return this.balanceRepo.find({
      where: ctx.shopId
        ? [
            { orgId: ctx.orgId, creditorShopId: ctx.shopId },
            { orgId: ctx.orgId, debtorShopId: ctx.shopId },
          ]
        : { orgId: ctx.orgId },
      relations: { creditorShop: true, debtorShop: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async payments(ctx: ActorContext): Promise<BranchPayment[]> {
    if (ctx.shopId) await this.requireBranchActor(ctx, ctx.shopId);
    else this.requireOwner(ctx);
    return this.paymentRepo.find({
      where: ctx.shopId
        ? [
            { orgId: ctx.orgId, fromShopId: ctx.shopId },
            { orgId: ctx.orgId, toShopId: ctx.shopId },
          ]
        : { orgId: ctx.orgId },
      relations: { fromShop: true, toShop: true, paidBy: true, answeredBy: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * The debtor branch pays its creditor back. The owner's own payment is
   * confirmed on the spot (§8 Q5: they cannot cheat themselves); a custodian's
   * waits for the receiving branch to say the money arrived.
   */
  async pay(ctx: ActorContext, dto: CreateBranchPaymentDto): Promise<BranchPayment> {
    const fromShopId = requireShop(ctx);
    const actor = await this.requireBranchActor(ctx, fromShopId);

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Payment amount must be greater than zero');

    const rateRow = await this.currency.getRate(ctx.orgId);
    const systemRate = rateRow?.usdToFcRate ? new Decimal(rateRow.usdToFcRate) : null;
    let amountUsd = amount;
    if (dto.currency === BranchPaymentCurrency.FC) {
      if (!systemRate || systemRate.lte(0)) {
        throw new BadRequestException(
          'System rate not set — configure the USD → FC rate in Settings before recording FC payments',
        );
      }
      amountUsd = amount.div(systemRate);
    }
    // No Current Market Rate spread here, unlike an expense: nothing is
    // exchanged. The same notes move from one branch's till to another's.

    const saved = await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(BranchBalance, {
        where: { orgId: ctx.orgId, creditorShopId: dto.toShopId, debtorShopId: fromShopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!balance || new Decimal(balance.outstanding).lte(0)) {
        throw new BadRequestException('This branch owes nothing to that branch');
      }
      if (amountUsd.toDecimalPlaces(4).gt(balance.outstanding)) {
        throw new BadRequestException('Payment is more than this branch owes');
      }
      const pending = await manager.count(BranchPayment, {
        where: { balanceId: balance.id, status: BranchPaymentStatus.PENDING },
      });
      if (pending > 0) {
        throw new ConflictException(
          'A payment to that branch is still waiting to be confirmed',
        );
      }

      const payment = manager.create(BranchPayment, {
        orgId: ctx.orgId,
        balanceId: balance.id,
        fromShopId,
        toShopId: dto.toShopId,
        amount: amount.toFixed(4),
        currency: dto.currency,
        amountUsd: amountUsd.toFixed(4),
        usdToFcRateSnapshot: systemRate?.toFixed(4) ?? null,
        status: BranchPaymentStatus.PENDING,
        note: dto.note?.trim() || null,
        paidById: ctx.actorId,
      });

      if (actor.isOwner) this.applyConfirmation(balance, payment, ctx.actorId);
      await manager.save(BranchBalance, balance);
      return manager.save(BranchPayment, payment);
    });

    return this.paymentById(ctx, saved.id);
  }

  async confirmPayment(ctx: ActorContext, id: string): Promise<BranchPayment> {
    const toShopId = requireShop(ctx);
    await this.requireBranchActor(ctx, toShopId);

    await this.dataSource.transaction(async (manager) => {
      const payment = await this.lockPendingPayment(manager, ctx, id, toShopId);
      const balance = await manager.findOneOrFail(BranchBalance, {
        where: { id: payment.balanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (new Decimal(payment.amountUsd).gt(balance.outstanding)) {
        throw new BadRequestException('Payment is more than this branch owes');
      }
      this.applyConfirmation(balance, payment, ctx.actorId);
      await manager.save(BranchBalance, balance);
      await manager.save(BranchPayment, payment);
    });

    return this.paymentById(ctx, id);
  }

  async rejectPayment(ctx: ActorContext, id: string): Promise<BranchPayment> {
    const toShopId = requireShop(ctx);
    await this.requireBranchActor(ctx, toShopId);

    await this.dataSource.transaction(async (manager) => {
      const payment = await this.lockPendingPayment(manager, ctx, id, toShopId);
      payment.status = BranchPaymentStatus.REJECTED;
      payment.answeredById = ctx.actorId;
      payment.answeredAt = new Date();
      await manager.save(BranchPayment, payment);
    });

    return this.paymentById(ctx, id);
  }

  // ─── Queries other modules ask ─────────────────────────────────────────────

  /** Transfers waiting for this branch to verify. Drives the dashboard alert. */
  async countIncoming(orgId: string, shopId: string): Promise<number> {
    return this.transferRepo.count({
      where: { orgId, toShopId: shopId, status: BranchTransferStatus.IN_TRANSIT },
    });
  }

  /** Payments waiting for this branch to confirm. Drives the dashboard alert. */
  async countPendingPaymentsIn(orgId: string, shopId: string): Promise<number> {
    return this.paymentRepo.count({
      where: { orgId, toShopId: shopId, status: BranchPaymentStatus.PENDING },
    });
  }

  /** Confirmed branch payments in and out of one branch, USD. Feeds the cash position. */
  async cashFlows(orgId: string, shopId: string): Promise<{ in: Decimal; out: Decimal }> {
    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .select(
        `COALESCE(SUM(CASE WHEN p.toShopId = :shop THEN CAST(p.amountUsd AS DECIMAL) ELSE 0 END), 0)`,
        'cashIn',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN p.fromShopId = :shop THEN CAST(p.amountUsd AS DECIMAL) ELSE 0 END), 0)`,
        'cashOut',
      )
      .where('p.orgId = :orgId', { orgId })
      .andWhere('p.status = :status', { status: BranchPaymentStatus.CONFIRMED })
      .andWhere('(p.toShopId = :shop OR p.fromShopId = :shop)', { shop: shopId })
      .getRawOne<{ cashIn: string; cashOut: string }>();
    return { in: new Decimal(rows?.cashIn ?? 0), out: new Decimal(rows?.cashOut ?? 0) };
  }

  /**
   * Whether goods that left this custody are still in escrow. A reject would
   * put them back on the custodian's lots, so the custody must stay open until
   * the transfer is answered. Incoming goods don't block: if the custody ends
   * first, the owner simply receives them onto the unassigned shelf.
   */
  async custodyHasTransferInTransit(custodyId: string): Promise<boolean> {
    const n = await this.transferRepo.count({
      where: { fromCustodyId: custodyId, status: BranchTransferStatus.IN_TRANSIT },
    });
    return n > 0;
  }

  /** Whether this custodian paid another branch and is still waiting for it to be confirmed. */
  async custodianHasPendingPayment(custody: StockCustody): Promise<boolean> {
    const n = await this.paymentRepo.count({
      where: {
        orgId: custody.orgId,
        fromShopId: custody.shopId,
        paidById: custody.custodianId,
        status: BranchPaymentStatus.PENDING,
      },
    });
    return n > 0;
  }

  /** Whether a branch has goods in escrow or an unsettled balance either way. */
  async shopHasOpenBranchBusiness(orgId: string, shopId: string): Promise<boolean> {
    const inTransit = await this.transferRepo.count({
      where: [
        { orgId, fromShopId: shopId, status: BranchTransferStatus.IN_TRANSIT },
        { orgId, toShopId: shopId, status: BranchTransferStatus.IN_TRANSIT },
      ],
    });
    if (inTransit > 0) return true;
    const owing = await this.balanceRepo.count({
      where: [
        { orgId, creditorShopId: shopId, outstanding: MoreThan('0') },
        { orgId, debtorShopId: shopId, outstanding: MoreThan('0') },
      ],
    });
    return owing > 0;
  }

  /** Whether a product sits in escrow going out of this branch. Blocks a rename. */
  async productInTransit(orgId: string, shopId: string, productName: string): Promise<boolean> {
    const n = await this.transferRepo
      .createQueryBuilder('t')
      .innerJoin('t.items', 'i')
      .where('t.orgId = :orgId', { orgId })
      .andWhere('(t.fromShopId = :shop OR t.toShopId = :shop)', { shop: shopId })
      .andWhere('t.status = :status', { status: BranchTransferStatus.IN_TRANSIT })
      .andWhere('LOWER(i.productName) = :name', { name: productName.toLowerCase() })
      .getCount();
    return n > 0;
  }

  /**
   * Branch money a custodian personally moved during a handover period, in FC.
   * Paid out lowers the cash they should hand over; received raises it.
   */
  async custodianCashFc(
    custody: StockCustody,
    from: Date,
    to: Date,
    systemRate: Decimal,
  ): Promise<{ paidOutFc: Decimal; receivedFc: Decimal }> {
    const rows = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.orgId = :orgId', { orgId: custody.orgId })
      .andWhere('p.status = :status', { status: BranchPaymentStatus.CONFIRMED })
      .andWhere('p.answeredAt BETWEEN :from AND :to', { from, to })
      .andWhere(
        new Brackets((w) => {
          w.where('(p.fromShopId = :shop AND p.paidById = :who)').orWhere(
            '(p.toShopId = :shop AND p.answeredById = :who)',
          );
        }),
      )
      .setParameters({ shop: custody.shopId, who: custody.custodianId })
      .getMany();

    let paidOutFc = new Decimal(0);
    let receivedFc = new Decimal(0);
    for (const p of rows) {
      const fc =
        p.currency === BranchPaymentCurrency.FC
          ? new Decimal(p.amount)
          : new Decimal(p.amount).mul(p.usdToFcRateSnapshot ? new Decimal(p.usdToFcRateSnapshot) : systemRate);
      if (p.fromShopId === custody.shopId && p.paidById === custody.custodianId) paidOutFc = paidOutFc.plus(fc);
      if (p.toShopId === custody.shopId && p.answeredById === custody.custodianId) receivedFc = receivedFc.plus(fc);
    }
    return { paidOutFc, receivedFc };
  }

  /** Whether this actor may act for the branch: the owner or its OPEN custodian. */
  async isBranchActor(ctx: ActorContext, shopId: string): Promise<boolean> {
    try {
      await this.requireBranchActor(ctx, shopId);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /**
   * The owner, or the person in charge of this branch (its OPEN custodian).
   * Nobody else, whatever services their role holds.
   */
  private async requireBranchActor(ctx: ActorContext, shopId: string): Promise<BranchActor> {
    if (ctx.tier === 'OWNER') return { custody: null, isOwner: true };
    if (ctx.tier === 'FULL_EMPLOYEE') {
      const custody = await this.custodyRepo.findOne({
        where: {
          orgId: ctx.orgId,
          shopId,
          custodianId: ctx.actorId,
          status: StockCustodyStatus.OPEN,
        },
      });
      if (custody) return { custody, isOwner: false };
    }
    throw new ForbiddenException(
      'Only the owner or the person in charge of this branch can do this',
    );
  }

  private requireOwner(ctx: ActorContext): void {
    if (ctx.tier !== 'OWNER') {
      throw new ForbiddenException(
        'Only the owner or the person in charge of this branch can do this',
      );
    }
  }

  /**
   * The lots this actor may send from: their own custody volume when the
   * custodian sends, the unassigned shelf when the owner does. Held by this
   * business's books (not a mini's), SUPPLIER first then oldest (rule 2).
   */
  private async shelfLots(
    manager: EntityManager,
    ctx: ActorContext,
    shopId: string,
    actor: BranchActor,
    productName: string,
    variantId: string | null,
  ): Promise<InventoryEntry[]> {
    const match = variantId ? { variantId } : { productName, variantId: IsNull() };
    const lots = await manager.find(InventoryEntry, {
      where: {
        orgId: ctx.orgId,
        shopId,
        // tenancy-exempt: the holder of the shelf — the business, never a mini
        // holding consigned goods at this branch.
        ownerId: ctx.effectiveOwnerId,
        custodianId: actor.custody ? actor.custody.custodianId : IsNull(),
        source: In(SHELF_SOURCES),
        quantityRemaining: MoreThan(0),
        ...match,
      },
      order: { createdAt: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    return [
      ...lots.filter((l) => l.source === InventorySource.SUPPLIER),
      ...lots.filter((l) => l.source === InventorySource.PERSONAL),
    ];
  }

  private async lockInTransit(
    manager: EntityManager,
    ctx: ActorContext,
    id: string,
  ): Promise<BranchTransfer> {
    // Lock the bare row first: Postgres refuses FOR UPDATE across outer joins.
    const locked = await manager.findOne(BranchTransfer, {
      where: { id, orgId: ctx.orgId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new NotFoundException('Transfer not found');
    if (locked.status !== BranchTransferStatus.IN_TRANSIT) {
      throw new ConflictException('This transfer has already been answered');
    }
    return manager.findOneOrFail(BranchTransfer, {
      where: { id },
      relations: { fromShop: true, toShop: true },
    });
  }

  /** Put every draw back on the lot it left. The escrow unwinds exactly. */
  private async restoreDraws(
    manager: EntityManager,
    transfer: BranchTransfer,
    notes: string,
  ): Promise<void> {
    const items = await manager.find(BranchTransferItem, {
      where: { transferId: transfer.id },
      relations: { draws: true },
    });
    for (const item of items) {
      for (const draw of item.draws) {
        const lot = await manager.findOneOrFail(InventoryEntry, {
          where: { id: draw.inventoryEntryId },
          lock: { mode: 'pessimistic_write' },
        });
        const before = lot.quantityRemaining;
        lot.quantityRemaining = before + draw.quantity;
        await manager.save(InventoryEntry, lot);
        await this.stockMovements.record(manager, {
          ownerId: lot.ownerId,
          entry: lot,
          reason: StockMovementReason.TRANSFER_RETURN_IN,
          qty: draw.quantity,
          qtyBefore: before,
          notes,
        });
      }
    }
  }

  /**
   * Make the product sellable at B before the lots land. Sizes and groups are
   * per branch, so a sized product gets B's own group and size (matched by
   * name and label, created if missing). A simple product gets a B price row
   * copied from A when B has none; B's own price wins when it has one.
   */
  private async landingProduct(
    manager: EntityManager,
    transfer: BranchTransfer,
    item: BranchTransferItem,
  ): Promise<{ groupId: string | null; variantId: string | null; sellingPrice: string | null }> {
    const scope = { orgId: transfer.orgId, shopId: transfer.toShopId };

    if (item.variantId) {
      const fromVariant = await manager.findOne(ProductVariant, {
        where: { id: item.variantId },
        relations: { group: true },
      });
      if (!fromVariant) throw new NotFoundException(`Size not found for "${item.productName}"`);
      const fromGroup = fromVariant.group;

      let group = await manager.findOne(ProductGroup, { where: { ...scope, name: fromGroup.name } });
      if (!group) {
        group = await manager.save(
          ProductGroup,
          manager.create(ProductGroup, {
            orgId: transfer.orgId,
            shopId: transfer.toShopId,
            name: fromGroup.name,
            category: fromGroup.category,
            cartonSellingPrice: fromGroup.cartonSellingPrice,
            cartonBuyingPrice: fromGroup.cartonBuyingPrice,
          }),
        );
      }
      let variant = await manager.findOne(ProductVariant, {
        where: { groupId: group.id, label: fromVariant.label },
      });
      if (!variant) {
        variant = await manager.save(
          ProductVariant,
          manager.create(ProductVariant, {
            orgId: transfer.orgId,
            shopId: transfer.toShopId,
            groupId: group.id,
            label: fromVariant.label,
            unitCost: fromVariant.unitCost,
            sellingPrice: fromVariant.sellingPrice,
            piecesPerCarton: fromVariant.piecesPerCarton,
            sortOrder: fromVariant.sortOrder,
          }),
        );
      }
      return { groupId: group.id, variantId: variant.id, sellingPrice: variant.sellingPrice };
    }

    const existing = await manager.findOne(ProductPrice, {
      where: { ...scope, productName: item.productName },
    });
    if (existing) return { groupId: null, variantId: null, sellingPrice: existing.unitPrice };

    const fromPrice = await manager.findOne(ProductPrice, {
      where: { orgId: transfer.orgId, shopId: transfer.fromShopId, productName: item.productName },
    });
    if (fromPrice) {
      await manager.save(
        ProductPrice,
        manager.create(ProductPrice, {
          orgId: transfer.orgId,
          shopId: transfer.toShopId,
          productName: item.productName,
          unitPrice: fromPrice.unitPrice,
        }),
      );
      return { groupId: null, variantId: null, sellingPrice: fromPrice.unitPrice };
    }
    return { groupId: null, variantId: null, sellingPrice: null };
  }

  private applyConfirmation(balance: BranchBalance, payment: BranchPayment, answeredById: string): void {
    balance.totalPaid = new Decimal(balance.totalPaid).plus(payment.amountUsd).toFixed(4);
    balance.outstanding = new Decimal(balance.outstanding).minus(payment.amountUsd).toFixed(4);
    payment.status = BranchPaymentStatus.CONFIRMED;
    payment.answeredById = answeredById;
    payment.answeredAt = new Date();
  }

  private async lockPendingPayment(
    manager: EntityManager,
    ctx: ActorContext,
    id: string,
    toShopId: string,
  ): Promise<BranchPayment> {
    const payment = await manager.findOne(BranchPayment, {
      where: { id, orgId: ctx.orgId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.toShopId !== toShopId) {
      throw new ForbiddenException('This payment is not addressed to this branch');
    }
    if (payment.status !== BranchPaymentStatus.PENDING) {
      throw new ConflictException('This payment has already been answered');
    }
    return payment;
  }

  private async paymentById(ctx: ActorContext, id: string): Promise<BranchPayment> {
    return this.paymentRepo.findOneOrFail({
      where: { id, orgId: ctx.orgId },
      relations: { fromShop: true, toShop: true, paidBy: true, answeredBy: true },
    });
  }
}
