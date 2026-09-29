import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  ConsignmentRequest,
  ConsignmentStatus,
  CustodyAdjustmentKind,
  CustodyHandover,
  CustodyHandoverAdjustment,
  CustodyHandoverItem,
  CustodyHandoverStatus,
  Expense,
  ExpenseCurrency,
  InventoryEntry,
  MiniSettlement,
  MiniSettlementStatus,
  SaleApprovalStatus,
  SaleTransaction,
  StockCustody,
  StockCustodyStatus,
  StockMovementReason,
} from '../entities';
import type {
  CustodyHandoverMiniLine,
  CustodyHandoverRejectedLine,
  CustodyHandoverSoldLine,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { holderCond, readScope } from '../common/shop-scope';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CurrencyService } from '../currency/currency.service';
import { CreateCustodyHandoverDto } from './dto/create-handover.dto';
import { CreateHandoverAdjustmentDto } from './dto/handover-adjustment.dto';
import { ListCustodyHandoversDto, RejectCustodyHandoverDto } from './dto/list-handovers.dto';

/** What a custodian would owe if they closed the period right now. */
export interface CustodyHandoverPreview {
  custodyId: string;
  periodStart: Date;
  periodEnd: Date;
  soldLines: CustodyHandoverSoldLine[];
  rejectedLines: CustodyHandoverRejectedLine[];
  miniRollupLines: CustodyHandoverMiniLine[];
  /** FC taken for goods sold from this volume in the period. */
  salesFc: string;
  /** FC handed up by minis during the period (§3.6). */
  miniRollupCashFc: string;
  /**
   * Minis still out with goods from this volume whose handover has not landed.
   * Shown so the custodian is not left looking short for stock he has not got
   * back yet.
   */
  pendingMiniHandovers: { miniId: string; miniName: string; settlementId: string }[];
  /** FC the custodian spent out of the till in the period. */
  expensesFc: string;
  /** salesFc + miniRollupCashFc − expensesFc. */
  cashExpectedFc: string;
  /** Sales nobody has attested to yet. A handover cannot be submitted above zero. */
  unattestedSaleCount: number;
  /** Lots still in hand — everything here is what submitting now hands back. */
  holding: {
    inventoryEntryId: string;
    productName: string;
    variantLabel: string | null;
    quantityRemaining: number;
    unitCost: string;
    piecesPerCarton: number | null;
  }[];
}

interface PeriodFigures {
  soldLines: CustodyHandoverSoldLine[];
  rejectedLines: CustodyHandoverRejectedLine[];
  salesFc: Decimal;
  expensesFc: Decimal;
  unattestedSaleCount: number;
  miniRollupLines: CustodyHandoverMiniLine[];
  miniRollupCashFc: Decimal;
  /** Minis still holding goods from this volume with a handover not yet settled. */
  pendingMiniHandovers: { miniId: string; miniName: string; settlementId: string }[];
}

/**
 * The check: one settlement period inside a custody (`SHOP_CUSTODY_PLAN.md` §3.3).
 *
 * **This service books no cash, and that is deliberate.** A mini's handover
 * books cash on approval because a mini's sales sit on the mini's own books
 * until they settle. A custodian's sales are on the employer's books at the
 * employer's branch from the moment they happen — the money already counted
 * towards the branch's cash position (§3.5). Booking it again here would double
 * every franc the business took.
 *
 * So a handover is a **reconciliation document**, not a ledger entry: it states
 * what the books say should have come back, records what the custodian handed
 * over, and carries the owner's hand-written lines for the difference (§3.8).
 * The only ledger effects on approval are stock ones — returned goods going
 * back on the shelf, and item adjustments landing as typed stock movements.
 */
@Injectable()
export class CustodyHandoversService {
  constructor(
    @InjectRepository(CustodyHandover)
    private readonly handoverRepo: Repository<CustodyHandover>,
    @InjectRepository(CustodyHandoverAdjustment)
    private readonly adjustmentRepo: Repository<CustodyHandoverAdjustment>,
    @InjectRepository(StockCustody)
    private readonly custodyRepo: Repository<StockCustody>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ConsignmentRequest)
    private readonly consignmentRepo: Repository<ConsignmentRequest>,
    @InjectRepository(MiniSettlement)
    private readonly settlementRepo: Repository<MiniSettlement>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
    private readonly currency: CurrencyService,
  ) {}

  // ─── The custodian's side ──────────────────────────────────────────────────

  async preview(ctx: ActorContext): Promise<CustodyHandoverPreview | null> {
    const custody = await this.myOpenCustody(ctx);
    if (!custody) return null;

    const periodStart = await this.periodStartFor(custody);
    const periodEnd = new Date();
    const figures = await this.periodFigures(ctx, custody, periodStart, periodEnd);

    const held = await this.heldLots(ctx, custody);

    return {
      custodyId: custody.id,
      periodStart,
      periodEnd,
      soldLines: figures.soldLines,
      rejectedLines: figures.rejectedLines,
      miniRollupLines: figures.miniRollupLines,
      pendingMiniHandovers: figures.pendingMiniHandovers,
      salesFc: figures.salesFc.toFixed(4),
      miniRollupCashFc: figures.miniRollupCashFc.toFixed(4),
      expensesFc: figures.expensesFc.toFixed(4),
      cashExpectedFc: figures.salesFc
        .plus(figures.miniRollupCashFc)
        .minus(figures.expensesFc)
        .toFixed(4),
      unattestedSaleCount: figures.unattestedSaleCount,
      holding: held.map((e) => ({
        inventoryEntryId: e.id,
        productName: e.productName,
        variantLabel: e.variant?.label ?? null,
        quantityRemaining: e.quantityRemaining,
        unitCost: e.unitCost,
        piecesPerCarton: e.piecesPerCarton,
      })),
    };
  }

  /**
   * Submit the period — always handing back everything currently held. There
   * is no partial settlement: approval ends the custody (`closeIfEmptyHanded`
   * below), so declaring only some of it back would leave the rest stranded on
   * an appointment nobody can act on any more. The owner decides afterward
   * whether to reappoint the same person, or someone else, for the next volume.
   *
   * Refused while any sale in the period is still PENDING. That is the one
   * thing attestation gates (§3.5): the money and the stock moved when the sale
   * was recorded, but a period the man in charge has not actually gone through
   * must not be closed on his behalf.
   */
  async submit(ctx: ActorContext, dto: CreateCustodyHandoverDto): Promise<CustodyHandover> {
    const custody = await this.myOpenCustody(ctx);
    if (!custody) throw new ForbiddenException('You are not holding a volume at this branch');

    const open = await this.handoverRepo.findOne({
      where: { custodyId: custody.id, status: CustodyHandoverStatus.PENDING },
    });
    if (open) throw new ConflictException('A handover is already awaiting approval');

    const periodStart = await this.periodStartFor(custody);
    const periodEnd = new Date();
    const figures = await this.periodFigures(ctx, custody, periodStart, periodEnd);

    if (figures.unattestedSaleCount > 0) {
      throw new ConflictException(
        `Go through the ${figures.unattestedSaleCount} sale(s) awaiting your approval before handing over`,
      );
    }

    const held = await this.heldLots(ctx, custody);
    const items = held.map((entry) => ({
      productName: entry.productName,
      quantity: entry.quantityRemaining,
      // The owner's real cost, carried through the round trip so the goods
      // re-enter the shelf at what they left with (§3.1).
      unitCost: entry.unitCost,
      inventoryEntryId: entry.id,
      variantId: entry.variantId,
      variantLabel: entry.variant?.label ?? null,
      piecesPerCarton: entry.piecesPerCarton,
    })) as CustodyHandoverItem[];

    const handover = this.handoverRepo.create({
      orgId: custody.orgId,
      shopId: custody.shopId,
      custodyId: custody.id,
      custodianId: custody.custodianId,
      status: CustodyHandoverStatus.PENDING,
      periodStart,
      periodEnd,
      cashDeclaredFc: new Decimal(dto.cashDeclaredFc).toFixed(4),
      cashExpectedFc: figures.salesFc
        .plus(figures.miniRollupCashFc)
        .minus(figures.expensesFc)
        .toFixed(4),
      miniRollupCashFc: figures.miniRollupCashFc.toFixed(4),
      expensesFc: figures.expensesFc.toFixed(4),
      // Sealed at submit. Re-deriving these at read time would let a later rate
      // change, a renamed product or a post-close rejection rewrite a figure
      // both parties already signed off on (§3.9, §3.10).
      soldLines: figures.soldLines,
      rejectedLines: figures.rejectedLines,
      miniRollupLines: figures.miniRollupLines,
      note: dto.note?.trim() || null,
      items,
    });
    return this.handoverRepo.save(handover);
  }

  /**
   * My own handovers, across appointments at this branch. Bounded to the actor
   * rather than the branch — a custodian sees their own record, not a
   * colleague's, which is the same line `mine` draws on the volume itself.
   */
  async myHandovers(ctx: ActorContext): Promise<CustodyHandover[]> {
    return this.handoverRepo.find({
      where: { ...readScope(ctx), custodianId: ctx.actorId },
      relations: { items: true, adjustments: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── The owner's side ──────────────────────────────────────────────────────

  /** "Switch dashboard work, filterable by handovers of all full employees." */
  async list(ctx: ActorContext, query: ListCustodyHandoversDto): Promise<CustodyHandover[]> {
    return this.handoverRepo.find({
      where: {
        ...readScope(ctx),
        ...(query.custodianId ? { custodianId: query.custodianId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      relations: { custodian: true, items: true, adjustments: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(ctx: ActorContext, id: string): Promise<CustodyHandover> {
    const handover = await this.handoverRepo.findOne({
      where: { id, ...readScope(ctx) },
      relations: { custodian: true, items: true, adjustments: true },
    });
    if (!handover) throw new NotFoundException('Handover not found');
    // The custodian may read their own; anyone else needs to be on these books
    // as the owner, which `readScope` has already established.
    return handover;
  }

  /**
   * The owner types a shortage, an overage, or a note onto the handover.
   *
   * Only while PENDING: once approved the document is the record of what was
   * agreed, and a line added afterwards would rewrite history rather than
   * correct it. A difference found later belongs on the next handover.
   */
  async addAdjustment(
    ctx: ActorContext,
    handoverId: string,
    dto: CreateHandoverAdjustmentDto,
  ): Promise<CustodyHandoverAdjustment> {
    const handover = await this.findOne(ctx, handoverId);
    this.assertPending(handover);

    const isItemLine =
      dto.kind === CustodyAdjustmentKind.ITEM_MISSING ||
      dto.kind === CustodyAdjustmentKind.ITEM_FOUND;
    const isCashLine =
      dto.kind === CustodyAdjustmentKind.CASH_SHORT ||
      dto.kind === CustodyAdjustmentKind.CASH_OVER;

    if (isCashLine && !dto.amountFc) {
      throw new BadRequestException('A cash line needs an amount');
    }
    if (isItemLine && (!dto.inventoryEntryId || !dto.quantity)) {
      throw new BadRequestException('An item line needs a lot and a quantity');
    }

    let productName: string | null = null;
    let variantLabel: string | null = null;
    if (dto.inventoryEntryId) {
      const entry = await this.entryRepo.findOne({
        where: { id: dto.inventoryEntryId, orgId: handover.orgId, shopId: handover.shopId },
        relations: { variant: true },
      });
      if (!entry) throw new NotFoundException('Lot not found at this branch');
      productName = entry.productName;
      variantLabel = entry.variant?.label ?? null;
    }

    const adjustment = this.adjustmentRepo.create({
      handoverId: handover.id,
      kind: dto.kind,
      amountFc: dto.amountFc ? new Decimal(dto.amountFc).toFixed(4) : null,
      inventoryEntryId: dto.inventoryEntryId ?? null,
      quantity: dto.quantity ?? null,
      productName,
      variantLabel,
      note: dto.note.trim(),
      createdById: ctx.actorId,
    });
    return this.adjustmentRepo.save(adjustment);
  }

  async removeAdjustment(ctx: ActorContext, adjustmentId: string): Promise<void> {
    const adjustment = await this.adjustmentRepo.findOne({ where: { id: adjustmentId } });
    if (!adjustment) throw new NotFoundException('Line not found');
    const handover = await this.findOne(ctx, adjustment.handoverId);
    this.assertPending(handover);
    await this.adjustmentRepo.remove(adjustment);
  }

  /**
   * Approve, in one transaction: declared returns go back on the unassigned
   * shelf, item adjustments land as typed stock movements, the period is
   * sealed, and — since a handover now always declares everything held — the
   * custody ends right there. **No cash is booked** — see the class note.
   */
  async approve(ctx: ActorContext, id: string): Promise<CustodyHandover> {
    const handover = await this.findOne(ctx, id);
    this.assertPending(handover);

    // Never your own. Service-level, not UI-level: the point of the document is
    // that a second person looked at it.
    if (handover.custodianId === ctx.actorId) {
      throw new ForbiddenException('Someone else has to approve your own handover');
    }

    return this.dataSource.transaction(async (manager) => {
      for (const item of handover.items) {
        await this.returnToShelf(manager, ctx, item);
      }

      const adjustments = await manager.find(CustodyHandoverAdjustment, {
        where: { handoverId: handover.id },
      });
      for (const adj of adjustments) {
        await this.applyItemAdjustment(manager, adj);
      }

      handover.status = CustodyHandoverStatus.APPROVED;
      handover.approvedAt = new Date();
      handover.approvedById = ctx.actorId;
      const saved = await manager.save(CustodyHandover, handover);

      await this.closeIfEmptyHanded(manager, handover.custodyId);

      return saved;
    });
  }

  /**
   * A handover now always declares everything the custodian holds (`submit()`
   * above), so approving one leaves their hands empty — the appointment closes
   * right then, rather than making the owner repeat the same conclusion as a
   * second, separate "End custody" click. Skipped only in the narrow case
   * where new stock landed on their books between submission and this approval
   * (a fresh issue accepted mid-review) or a sale is still unattested; the
   * owner closes it by hand once that clears, exactly as before this existed —
   * see `CustodyService.close()`, whose two preconditions this mirrors.
   */
  private async closeIfEmptyHanded(manager: EntityManager, custodyId: string): Promise<void> {
    const custody = await manager.findOne(StockCustody, { where: { id: custodyId } });
    if (!custody || custody.status === StockCustodyStatus.CLOSED) return;

    const stillHeld = await manager.find(InventoryEntry, {
      where: { orgId: custody.orgId, shopId: custody.shopId, custodianId: custody.custodianId },
    });
    if (stillHeld.some((e) => e.quantityRemaining > 0)) return;

    const unattested = await manager.count(SaleTransaction, {
      where: {
        custodyId: custody.id,
        approvalStatus: SaleApprovalStatus.PENDING,
        rejectedAt: IsNull(),
      },
    });
    if (unattested > 0) return;

    custody.status = StockCustodyStatus.CLOSED;
    custody.closedAt = new Date();
    await manager.save(StockCustody, custody);
  }

  /** Refuse it. No side effects; the period stays open and can be submitted again. */
  async reject(
    ctx: ActorContext,
    id: string,
    dto: RejectCustodyHandoverDto,
  ): Promise<CustodyHandover> {
    const handover = await this.findOne(ctx, id);
    this.assertPending(handover);
    if (handover.custodianId === ctx.actorId) {
      throw new ForbiddenException('Someone else has to review your own handover');
    }
    handover.status = CustodyHandoverStatus.REJECTED;
    handover.rejectedAt = new Date();
    handover.rejectionReason = dto.reason?.trim() || null;
    return this.handoverRepo.save(handover);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private assertPending(handover: CustodyHandover): void {
    if (handover.status !== CustodyHandoverStatus.PENDING) {
      throw new ConflictException('This handover has already been settled');
    }
  }

  private async myOpenCustody(ctx: ActorContext): Promise<StockCustody | null> {
    return this.custodyRepo.findOne({
      where: { ...readScope(ctx), custodianId: ctx.actorId, status: StockCustodyStatus.OPEN },
    });
  }

  /**
   * Where this period begins: the end of the last APPROVED handover, or the
   * appointment itself. A REJECTED handover deliberately does not move the
   * line — the period it covered was never settled, so it is still open.
   */
  private async periodStartFor(custody: StockCustody): Promise<Date> {
    const last = await this.handoverRepo.findOne({
      where: { custodyId: custody.id, status: CustodyHandoverStatus.APPROVED },
      order: { periodEnd: 'DESC' },
    });
    return last?.periodEnd ?? custody.openedAt;
  }

  private async heldLots(ctx: ActorContext, custody: StockCustody): Promise<InventoryEntry[]> {
    const lots = await this.entryRepo.find({
      where: { orgId: custody.orgId, shopId: custody.shopId, custodianId: custody.custodianId },
      relations: { variant: true },
      order: { createdAt: 'ASC' },
    });
    return lots.filter((e) => e.quantityRemaining > 0);
  }

  /**
   * The period's money and lines.
   *
   * Sales bucket by server `created_at` (§3.10), so a sale replayed from the
   * offline queue after a period closed falls into the next one rather than
   * reopening a sealed document.
   *
   * FC comes from each sale's own locked rate where it has one, and otherwise
   * from the business's system rate **read once, here, at submit time**. Owner
   * and full-employee stock carries no per-lot rate snapshot (only a mini's
   * consigned lot does), so this is what "locked" can mean for custody: the
   * figure is frozen onto the handover and never re-derived, which is the
   * property §3.9 actually needs.
   */
  private async periodFigures(
    ctx: ActorContext,
    custody: StockCustody,
    from: Date,
    to: Date,
  ): Promise<PeriodFigures> {
    const rate = await this.currency.getRate(custody.orgId);
    const systemRate = new Decimal(rate?.usdToFcRate ?? 0);

    // No `variant` relation to load: a sale row carries `variantLabel` as a
    // snapshot taken at sale time, which is what a sealed handover wants — a
    // size renamed afterwards must not rewrite a settled document.
    //
    // `inventoryEntry` IS loaded, for `piecesPerCarton` alone — a display
    // convenience (how many pieces make a carton), not a figure the document
    // needs frozen, so reading it live off the lot is fine here.
    const sales = await this.saleRepo.find({
      where: { custodyId: custody.id, date: Between(from, to) },
      relations: { inventoryEntry: true },
      order: { date: 'ASC' },
    });

    const fcOf = (usd: Decimal, snapshot: string | null): Decimal =>
      usd.times(snapshot ? new Decimal(snapshot) : systemRate);

    const soldByKey = new Map<string, CustodyHandoverSoldLine>();
    const rejectedLines: CustodyHandoverRejectedLine[] = [];
    let salesFc = new Decimal(0);
    let unattestedSaleCount = 0;

    for (const sale of sales) {
      const gross = new Decimal(sale.salePrice).times(sale.qtySold);
      const valueFc = fcOf(gross, sale.usdToFcRateSnapshot);

      if (sale.rejectedAt) {
        // Business rule 9: a rejected sale is kept and shown, never counted.
        // Printed with no amount beside it — the goods are already back in the
        // returns, so charging for them too would bill the custodian twice.
        rejectedLines.push({
          productName: sale.productName,
          variantLabel: sale.variantLabel,
          qtySold: sale.qtySold,
          valueFc: valueFc.toFixed(4),
          rejectedAt: sale.rejectedAt.toISOString(),
          reason: sale.rejectionReason,
        });
        continue;
      }

      if (sale.approvalStatus === SaleApprovalStatus.PENDING) unattestedSaleCount += 1;

      salesFc = salesFc.plus(valueFc);
      const key = `${sale.productName}::${sale.variantLabel ?? ''}`;
      const profitFc = fcOf(new Decimal(sale.profit), sale.usdToFcRateSnapshot);
      const line = soldByKey.get(key);
      if (line) {
        line.qtySold += sale.qtySold;
        line.valueFc = new Decimal(line.valueFc).plus(valueFc).toFixed(4);
        line.profitFc = new Decimal(line.profitFc).plus(profitFc).toFixed(4);
      } else {
        soldByKey.set(key, {
          productName: sale.productName,
          variantLabel: sale.variantLabel,
          qtySold: sale.qtySold,
          piecesPerCarton: sale.inventoryEntry?.piecesPerCarton ?? null,
          valueFc: valueFc.toFixed(4),
          profitFc: profitFc.toFixed(4),
        });
      }
    }

    const { miniRollupLines, miniRollupCashFc, pendingMiniHandovers } = await this.miniRollup(
      custody,
      from,
      to,
      systemRate,
    );

    const expenses = await this.expenseRepo.find({
      where: {
        orgId: custody.orgId,
        shopId: custody.shopId,
        actorId: custody.custodianId,
        date: Between(from, to),
      },
    });
    let expensesFc = new Decimal(0);
    for (const e of expenses) {
      const amount = new Decimal(e.amount);
      expensesFc = expensesFc.plus(
        e.currency === ExpenseCurrency.FC
          ? amount
          : amount.times(e.usdToFcRateSnapshot ? new Decimal(e.usdToFcRateSnapshot) : systemRate),
      );
    }

    return {
      soldLines: [...soldByKey.values()],
      rejectedLines,
      salesFc,
      expensesFc,
      unattestedSaleCount,
      miniRollupLines,
      miniRollupCashFc,
      pendingMiniHandovers,
    };
  }

  /**
   * What the minis under this custodian handed UP to him during the period
   * (`SHOP_CUSTODY_PLAN.md` §3.6): "+ money, + products" on what he in turn owes.
   *
   * The link is the consignment, not the person: a mini can be supplied by the
   * owner one week and by a custodian the next, so the goods remember where
   * they came from. Only settlements **approved inside the period** count — an
   * approval is when the cash and the goods actually changed hands.
   *
   * Also reports the minis who are still out with goods from this volume and
   * have a handover pending. Without it the custodian looks short at close
   * through no fault of his own: the stock left his volume and the money has
   * not arrived yet.
   */
  private async miniRollup(
    custody: StockCustody,
    from: Date,
    to: Date,
    systemRate: Decimal,
  ): Promise<{
    miniRollupLines: CustodyHandoverMiniLine[];
    miniRollupCashFc: Decimal;
    pendingMiniHandovers: { miniId: string; miniName: string; settlementId: string }[];
  }> {
    const empty = {
      miniRollupLines: [] as CustodyHandoverMiniLine[],
      miniRollupCashFc: new Decimal(0),
      pendingMiniHandovers: [] as { miniId: string; miniName: string; settlementId: string }[],
    };

    const consignments = await this.consignmentRepo.find({
      where: { custodyId: custody.id, status: ConsignmentStatus.ACCEPTED },
      select: { id: true, debtorId: true },
    });
    const miniIds = [...new Set(consignments.map((c) => c.debtorId))];
    if (miniIds.length === 0) return empty;

    const settlements = await this.settlementRepo.find({
      where: {
        miniId: In(miniIds),
        orgId: custody.orgId,
        shopId: custody.shopId,
      },
      relations: { mini: true, items: true },
      order: { createdAt: 'ASC' },
    });

    let miniRollupCashFc = new Decimal(0);
    const miniRollupLines: CustodyHandoverMiniLine[] = [];
    const pendingMiniHandovers: { miniId: string; miniName: string; settlementId: string }[] = [];

    for (const s of settlements) {
      const miniName = s.mini?.name ?? s.mini?.username ?? 'Employee';

      if (s.status === MiniSettlementStatus.PENDING) {
        pendingMiniHandovers.push({ miniId: s.miniId, miniName, settlementId: s.id });
        continue;
      }
      if (s.status !== MiniSettlementStatus.APPROVED) continue;
      if (!s.approvedAt || s.approvedAt < from || s.approvedAt > to) continue;

      // `cashAmountFc` is the mini's own locked-rate figure where the handover
      // carries one; older rows pre-date the snapshot and convert at the rate
      // this handover is being sealed with.
      const cashFc = s.cashAmountFc
        ? new Decimal(s.cashAmountFc)
        : new Decimal(s.cashAmount).times(systemRate);
      miniRollupCashFc = miniRollupCashFc.plus(cashFc);

      miniRollupLines.push({
        miniId: s.miniId,
        miniName,
        settlementId: s.id,
        approvedAt: s.approvedAt.toISOString(),
        cashFc: cashFc.toFixed(4),
        returnedUnits: (s.items ?? []).reduce((sum, i) => sum + i.quantity, 0),
      });
    }

    return { miniRollupLines, miniRollupCashFc, pendingMiniHandovers };
  }

  /** Off the custodian's lot, back onto the branch's unassigned shelf. */
  private async returnToShelf(
    manager: EntityManager,
    ctx: ActorContext,
    item: CustodyHandoverItem,
  ): Promise<void> {
    const lot = await manager.findOne(InventoryEntry, {
      where: { id: item.inventoryEntryId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lot) throw new NotFoundException('The lot being handed back no longer exists');
    if (item.quantity > lot.quantityRemaining) {
      throw new ConflictException(
        `"${item.productName}" moved since this handover was submitted — ask for it again`,
      );
    }

    const before = lot.quantityRemaining;
    lot.quantityRemaining = before - item.quantity;
    await manager.save(InventoryEntry, lot);
    await this.stockMovements.record(manager, {
      ownerId: lot.ownerId,
      entry: lot,
      reason: StockMovementReason.CUSTODY_RETURN_OUT,
      qty: item.quantity,
      qtyBefore: before,
      notes: 'Handed back at handover',
    });

    const shelved = manager.create(InventoryEntry, {
      source: lot.source,
      productName: lot.productName,
      unitCost: lot.unitCost,
      sellingPrice: lot.sellingPrice,
      category: lot.category,
      quantityOriginal: item.quantity,
      quantityRemaining: item.quantity,
      cartonPrice: lot.cartonPrice,
      piecesPerCarton: lot.piecesPerCarton,
      usdToFcRateSnapshot: lot.usdToFcRateSnapshot,
      ownerId: lot.ownerId,
      orgId: lot.orgId,
      shopId: lot.shopId,
      custodianId: null,
      supplierUserId: lot.supplierUserId,
      supplierDebtId: lot.supplierDebtId,
      groupId: lot.groupId,
      variantId: lot.variantId,
      actorId: ctx.actorId,
    });
    const saved = await manager.save(InventoryEntry, shelved);
    await this.stockMovements.record(manager, {
      ownerId: saved.ownerId,
      entry: saved,
      reason: StockMovementReason.CUSTODY_RETURN_IN,
      qty: item.quantity,
      qtyBefore: 0,
      notes: 'Returned from custody',
    });
  }

  /**
   * An owner's hand-written item line becomes a typed stock movement, so a
   * shortage lands in the stock ledger exactly like a damage or a recount
   * would. Cash lines write nothing — they are the record and this handover's
   * net, never a silent move of the branch's cash position (§3.8).
   */
  private async applyItemAdjustment(
    manager: EntityManager,
    adj: CustodyHandoverAdjustment,
  ): Promise<void> {
    if (!adj.inventoryEntryId || !adj.quantity) return;
    const reason =
      adj.kind === CustodyAdjustmentKind.ITEM_MISSING
        ? StockMovementReason.LOSS
        : adj.kind === CustodyAdjustmentKind.ITEM_FOUND
          ? StockMovementReason.RECOUNT_UP
          : null;
    if (!reason) return;

    const lot = await manager.findOne(InventoryEntry, {
      where: { id: adj.inventoryEntryId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lot) return;

    const before = lot.quantityRemaining;
    const delta = reason === StockMovementReason.LOSS ? -adj.quantity : adj.quantity;
    lot.quantityRemaining = Math.max(0, before + delta);
    await manager.save(InventoryEntry, lot);
    await this.stockMovements.record(manager, {
      ownerId: lot.ownerId,
      entry: lot,
      reason,
      qty: adj.quantity,
      qtyBefore: before,
      notes: adj.note,
    });
  }
}
