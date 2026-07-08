import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, IsNull, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  DebtorCredit,
  Employment,
  Expense,
  ExpenseCategory,
  ExpenseCurrency,
  InventoryEntry,
  InventorySource,
  MiniExpense,
  MiniSettlement,
  MiniSettlementItem,
  MiniSettlementStatus,
  Payment,
  PaymentDirection,
  PaymentStatus,
  ProductVariant,
  SaleTransaction,
  StockMovementReason,
  SupplierDebt,
} from '../entities';
import { ActorContext } from '../common/types/actor-context';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CurrencyService } from '../currency/currency.service';
import { CreateMiniSettlementDto } from './dto/create-mini-settlement.dto';
import { CreateMiniExpenseDto } from './dto/create-mini-expense.dto';
import { MiniActivityQueryDto } from './dto/mini-activity-query.dto';
import { MiniStatsPeriod } from './dto/mini-stats-query.dto';

export interface MiniActivitySale {
  id: string;
  productName: string;
  qtySold: number;
  salePrice: string;
  agreedUnitPrice: string;
  markup: string;
  /** The batch's locked FC/USD rate this sale was booked at (null pre-snapshot). */
  usdToFcRateSnapshot: string | null;
  date: Date;
}

export interface HandoverSoldLine {
  productName: string;
  /** Size, for sized products — null on simple products. */
  variantId: string | null;
  variantLabel: string | null;
  qtySold: number;
  /** Pieces per carton for this product (null if it isn't cartoned) — lets the
   *  client render the sold quantity in cartons/dozens/loose pieces. */
  piecesPerCarton: number | null;
  /** Everything below is USD (the ledger currency); the app renders in FC. */
  revenue: string; // what the mini collected (their sale prices)
  agreedValue: string; // what they owe the owner for these (agreed price × qty)
  profit: string; // the mini's markup (revenue − agreedValue)
  /** FC-native, converted at each sale's locked consignment rate. */
  agreedValueFc: string;
  profitFc: string;
}

export interface HandoverExpenseLine {
  category: string;
  description: string | null;
  /** FC — the mini records expenses in FC (physical cash). */
  amount: string;
}

export interface HandoverReturnLine {
  productName: string;
  /** Size, for sized products — null on simple products. Sent back on handover. */
  variantId: string | null;
  variantLabel: string | null;
  quantity: number;
  piecesPerCarton: number | null;
}

export interface HandoverPreview {
  /** Products sold since the last handover — what the cash is owed for. */
  sold: HandoverSoldLine[];
  /** Unsold units still held — handed back to the owner. */
  returns: HandoverReturnLine[];
  /** Total owed for the sold goods (Σ agreedValue), USD. */
  cashForSold: string;
  /** The mini's total markup on the sold goods (Σ profit), USD. */
  profitMade: string;
  /** FC-native aggregates (each sale at its locked rate) — what the app shows. */
  cashForSoldFc: string;
  profitMadeFc: string;
  /** Pending expenses to deduct, in FC. */
  expensesFc: string;
  /** Per-expense breakdown (FC) — the individual expenses this handover settles. */
  expenses: HandoverExpenseLine[];
}

export interface MiniStats {
  period: MiniStatsPeriod;
  /** Resolved window bounds (ISO). windowStart null = no lower bound (lifetime). */
  windowStart: string | null;
  windowEnd: string | null;
  /** When the mini last handed over (ISO) — powers the "since your last handover" notice. */
  lastHandoverAt: string | null;
  /** Agreed value of consigned-in products the mini STILL HOLDS within the
   *  window (Σ agreed price × quantityRemaining) — "what I owe" for goods not
   *  yet handed over, USD. Clears once a cycle is fully sold/returned. */
  iOwe: string;
  /** Total owed for goods sold in the window (Σ agreed price × qty), USD — the
   *  gross cash the mini must hand over before deducting expenses. */
  cashForSold: string;
  /** The mini's markup on the sold goods (Σ profit), USD. */
  profitMade: string;
  /** FC-native figures, each USD row converted at its OWN consignment's locked
   *  rate (falling back to the live rate for pre-snapshot rows). These are what
   *  the mini's app displays — a later rate change never moves them. */
  iOweFc: string;
  cashForSoldFc: string;
  profitMadeFc: string;
  /** Pending expenses within the window to deduct from the cash to hand over, FC. */
  expensesFc: string;
  /** Units sold within the window. */
  soldUnits: number;
}

export interface MiniActivityGiven {
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
  /** The rate this batch was consigned at, and the batch value in FC at it. */
  usdToFcRateSnapshot: string | null;
  agreedValueFc: string;
  date: Date;
}

export interface MiniActivity {
  miniUserId: string;
  miniUsername: string;
  dateFrom: string | null;
  dateTo: string | null;
  /** Consigned value handed to the mini within the window (agreed price × qty). */
  givenInPeriod: string;
  givenUnitsInPeriod: number;
  /** Per-consignment breakdown of what was handed to the mini in the window. */
  given: MiniActivityGiven[];
  /** Current point-in-time debt figures (not window-scoped). */
  outstanding: string;
  totalCreditGiven: string;
  totalReceived: string;
  /** Unsold units still physically with the mini right now. */
  stillOutUnits: number;
  /** Window-scoped sales aggregates. */
  soldUnits: number;
  soldAtSalePrice: string;
  soldAtAgreedPrice: string;
  markup: string;
  /** FC-native aggregates, each row at its batch's locked rate — for the FC
   *  display toggle on the dashboard. */
  givenInPeriodFc: string;
  soldAtSalePriceFc: string;
  soldAtAgreedPriceFc: string;
  markupFc: string;
  sales: MiniActivitySale[];
}

@Injectable()
export class MiniSettlementsService {
  constructor(
    @InjectRepository(MiniSettlement)
    private readonly settlementRepo: Repository<MiniSettlement>,
    @InjectRepository(MiniSettlementItem)
    private readonly itemRepo: Repository<MiniSettlementItem>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(DebtorCredit)
    private readonly debtorCreditRepo: Repository<DebtorCredit>,
    @InjectRepository(SupplierDebt)
    private readonly supplierDebtRepo: Repository<SupplierDebt>,
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
    @InjectRepository(MiniExpense)
    private readonly miniExpenseRepo: Repository<MiniExpense>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
    private readonly currencyService: CurrencyService,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  /** Resolve size labels for a set of variant ids in one query (id → label). */
  private async variantLabels(variantIds: (string | null | undefined)[]): Promise<Map<string, string>> {
    const ids = [...new Set(variantIds.filter((v): v is string => !!v))];
    if (ids.length === 0) return new Map();
    const rows = await this.variantRepo.find({ where: { id: In(ids) } });
    return new Map(rows.map((r) => [r.id, r.label]));
  }

  // ─── Mini employee: initiate a handover (cash + unsold returns) ────────────

  async create(ctx: ActorContext, dto: CreateMiniSettlementDto): Promise<MiniSettlement> {
    const miniId = ctx.effectiveOwnerId; // a mini operates on their own books
    if (!ctx.employment) {
      throw new ForbiddenException('Only a mini employee can hand over a settlement');
    }
    const ownerId = ctx.employment.employerId;

    const cash = new Decimal(dto.cashAmount ?? '0');
    if (cash.lt(0)) {
      throw new BadRequestException('Cash amount cannot be negative');
    }
    const returns = dto.returns ?? [];
    if (cash.lte(0) && returns.length === 0) {
      throw new BadRequestException('Nothing to hand over — provide cash and/or returned items');
    }

    const labels = await this.variantLabels(returns.map((r) => r.variantId));
    const items: MiniSettlementItem[] = [];
    for (const r of returns) {
      const productName = r.productName.trim().toLowerCase();
      // Sized products match the unsold lots by size; simple products by name.
      const where = r.variantId
        ? { ownerId: miniId, variantId: r.variantId, source: InventorySource.CONSIGNED_IN }
        : { ownerId: miniId, productName: ILike(productName), source: InventorySource.CONSIGNED_IN };
      const entries = await this.entryRepo.find({ where, order: { createdAt: 'ASC' } });
      const available = entries
        .filter((e) => e.quantityRemaining > 0)
        .reduce((sum, e) => sum + e.quantityRemaining, 0);
      if (available < r.quantity) {
        throw new BadRequestException(
          `You only have ${available} unsold "${productName}" to return, not ${r.quantity}`,
        );
      }
      // Snapshot the agreed price the mini owes (CONSIGNED_IN.unitCost = agreed
      // price) from the oldest lot; that value is reversed off the debt on approval.
      const agreedUnitPrice = entries[0]?.unitCost ?? '0.0000';
      items.push(
        this.itemRepo.create({
          productName,
          variantId: r.variantId ?? null,
          variantLabel: r.variantId ? labels.get(r.variantId) ?? null : null,
          quantity: r.quantity,
          agreedUnitPrice,
          unitCost: null,
        }),
      );
    }

    const settlement = this.settlementRepo.create({
      ownerId,
      miniId,
      status: MiniSettlementStatus.PENDING,
      cashAmount: cash.toFixed(4),
      cashAmountFc: dto.cashAmountFc ? new Decimal(dto.cashAmountFc).toFixed(4) : null,
      note: dto.note ?? null,
      items,
    });
    const saved = await this.settlementRepo.save(settlement);
    // Claim all currently-pending expenses onto this handover so they book on
    // the owner's books (and reduce the cash handed over) when it's approved.
    await this.miniExpenseRepo.update(
      { miniId, settlementId: IsNull() },
      { settlementId: saved.id },
    );
    return saved;
  }

  // ─── Mini employee: list own handovers ─────────────────────────────────────

  async findOutgoing(ctx: ActorContext): Promise<MiniSettlement[]> {
    return this.settlementRepo.find({
      where: { miniId: ctx.effectiveOwnerId },
      relations: { owner: true, items: true, payment: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Mini employee: how much they currently owe the employer ───────────────

  async myBalance(ctx: ActorContext): Promise<{ outstanding: string }> {
    const miniId = ctx.effectiveOwnerId;
    if (!ctx.employment) {
      throw new ForbiddenException('Only a mini employee has a handover balance');
    }
    const employerId = ctx.employment.employerId;
    const debt = await this.supplierDebtRepo.findOne({
      where: { ownerId: miniId, supplierUserId: employerId },
    });
    return { outstanding: debt ? new Decimal(debt.outstandingBalance).toFixed(4) : '0.0000' };
  }

  // ─── Mini employee: home statistics (windowed) ─────────────────────────────

  /**
   * Home-screen statistics for a mini employee, scoped to a period window.
   * Defaults to "since the last handover" so a mini opening the app sees their
   * current, un-settled cycle. Every figure the mini cares about — what they owe
   * for accepted goods, the cash they must hand over, their markup, and the
   * expenses that net the cash down — is window-scoped so the date filter is
   * meaningful across all of them.
   */
  async miniStats(
    ctx: ActorContext,
    period: MiniStatsPeriod = MiniStatsPeriod.SINCE_HANDOVER,
  ): Promise<MiniStats> {
    const miniId = ctx.effectiveOwnerId;
    if (!ctx.employment) {
      throw new ForbiddenException('Only a mini employee has home statistics');
    }

    const last = await this.settlementRepo.findOne({
      where: { miniId, status: MiniSettlementStatus.APPROVED },
      order: { approvedAt: 'DESC' },
    });
    const lastHandoverAt = last?.approvedAt ?? null;

    // Resolve the window's lower bound. today/week/month are rolling windows
    // (mirroring the sales summary presets); since_handover uses the last
    // approved handover; all has no bound.
    let windowStart: Date | null;
    switch (period) {
      case MiniStatsPeriod.TODAY: {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        windowStart = d;
        break;
      }
      case MiniStatsPeriod.WEEK:
        windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case MiniStatsPeriod.MONTH:
        windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case MiniStatsPeriod.ALL:
        windowStart = null;
        break;
      case MiniStatsPeriod.SINCE_HANDOVER:
      default:
        windowStart = lastHandoverAt;
        break;
    }

    // Live rate — fallback for any pre-snapshot rows (post-migration there
    // should be none for consigned stock/sales).
    const liveRate = (await this.currencyService.getRate())?.usdToFcRate ?? '1';
    const fcOf = (usd: Decimal, snapshot: string | null): Decimal =>
      usd.mul(new Decimal(snapshot ?? liveRate));

    // Sold-in-window: every sale on the mini's own books is a consigned sale
    // owed to the owner (unitCost = agreed price; profit = their markup). Each
    // sale's FC value converts at the lot's locked rate carried on the sale.
    const saleQb = this.saleRepo
      .createQueryBuilder('s')
      .where('s.owner_id = :miniId', { miniId });
    if (windowStart) saleQb.andWhere('s.created_at >= :start', { start: windowStart });
    const sales = await saleQb.getMany();
    let cashForSold = new Decimal(0);
    let profitMade = new Decimal(0);
    let cashForSoldFc = new Decimal(0);
    let profitMadeFc = new Decimal(0);
    let soldUnits = 0;
    for (const s of sales) {
      const agreed = new Decimal(s.unitCost).mul(s.qtySold);
      const profit = new Decimal(s.profit);
      cashForSold = cashForSold.plus(agreed);
      profitMade = profitMade.plus(profit);
      cashForSoldFc = cashForSoldFc.plus(fcOf(agreed, s.usdToFcRateSnapshot));
      profitMadeFc = profitMadeFc.plus(fcOf(profit, s.usdToFcRateSnapshot));
      soldUnits += s.qtySold;
    }

    // I OWE: agreed value of consigned-in stock the mini STILL HOLDS
    // (CONSIGNED_IN.unitCost = the agreed price they owe). Uses
    // quantityRemaining, not quantityOriginal — as goods are sold or returned at
    // handover the lot's remaining drops, so once a cycle is fully handed over
    // (everything sold or returned) every lot is 0 and I OWE clears. You can't
    // owe for what you've already reimbursed. Each lot's FC value converts at
    // its own locked rate.
    const inQb = this.entryRepo
      .createQueryBuilder('e')
      .where('e.owner_id = :miniId', { miniId })
      .andWhere('e.source = :src', { src: InventorySource.CONSIGNED_IN });
    if (windowStart) inQb.andWhere('e.created_at >= :start', { start: windowStart });
    const inEntries = await inQb.getMany();
    let iOwe = new Decimal(0);
    let iOweFc = new Decimal(0);
    for (const e of inEntries) {
      if (e.quantityRemaining <= 0) continue;
      const agreed = new Decimal(e.unitCost).mul(e.quantityRemaining);
      iOwe = iOwe.plus(agreed);
      iOweFc = iOweFc.plus(fcOf(agreed, e.usdToFcRateSnapshot));
    }

    // Expenses to deduct from the cash to hand over: only pending ones (already
    // handed-over expenses were deducted in a prior handover), within the window.
    const expQb = this.miniExpenseRepo
      .createQueryBuilder('me')
      .where('me.mini_id = :miniId', { miniId })
      .andWhere('me.settlement_id IS NULL');
    if (windowStart) expQb.andWhere('me.created_at >= :start', { start: windowStart });
    const exps = await expQb.getMany();
    const expensesFc = exps
      .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0))
      .toFixed(4);

    return {
      period,
      windowStart: windowStart ? windowStart.toISOString() : null,
      windowEnd: null,
      lastHandoverAt: lastHandoverAt ? new Date(lastHandoverAt).toISOString() : null,
      iOwe: iOwe.toFixed(4),
      cashForSold: cashForSold.toFixed(4),
      profitMade: profitMade.toFixed(4),
      iOweFc: iOweFc.toFixed(4),
      cashForSoldFc: cashForSoldFc.toFixed(4),
      profitMadeFc: profitMadeFc.toFixed(4),
      expensesFc,
      soldUnits,
    };
  }

  // ─── Mini employee: full handover breakdown (sold + returns + cash) ────────

  async handoverPreview(ctx: ActorContext): Promise<HandoverPreview> {
    const miniId = ctx.effectiveOwnerId;
    if (!ctx.employment) {
      throw new ForbiddenException('Only a mini employee has a handover');
    }

    // Boundary: everything sold AFTER the last approved handover is unsettled.
    const last = await this.settlementRepo.findOne({
      where: { miniId, status: MiniSettlementStatus.APPROVED },
      order: { approvedAt: 'DESC' },
    });
    const since = last?.approvedAt ?? null;

    // A mini only ever holds consigned stock, so every sale on their own books
    // is a consigned sale owed to the owner — no need to filter by source (and
    // doing so risks missing rows if the source string ever differs).
    const saleQb = this.saleRepo
      .createQueryBuilder('s')
      .where('s.owner_id = :miniId', { miniId });
    if (since) saleQb.andWhere('s.created_at > :since', { since });
    const sales = await saleQb.getMany();

    // The mini's consigned-in stock, fetched once: it supplies the
    // pieces-per-carton for every product (so both sold and returned quantities
    // render in cartons/dozens/loose pieces) and the unsold units to return.
    // Depleted lots (quantityRemaining = 0) are kept here so a fully-sold
    // product still resolves its carton size.
    const inEntries = await this.entryRepo.find({
      where: { ownerId: miniId, source: InventorySource.CONSIGNED_IN },
    });
    // Resolve carton size the same way inventory.listProducts does (line 138):
    // take the FIRST NON-NULL piecesPerCarton across the product's lots. Older
    // lots can be null (pre-carton-size migration) while newer ones carry it, so
    // a plain "first lot wins" would wrongly report the product as uncartoned
    // and render sold/returns in bare pieces.
    // Identity key: sized products key by size (variantId); simple by name — so
    // different sizes of one group don't collapse into a single row.
    const keyOf = (variantId: string | null | undefined, productName: string) =>
      variantId ?? productName;
    const retLabels = await this.variantLabels(inEntries.map((e) => e.variantId));

    const ppcByKey = new Map<string, number>();
    for (const e of inEntries) {
      const k = keyOf(e.variantId, e.productName);
      if (e.piecesPerCarton != null && !ppcByKey.has(k)) ppcByKey.set(k, e.piecesPerCarton);
    }

    // Live rate — fallback for any pre-snapshot sale rows. Each sale's FC value
    // converts at the lot's locked rate carried on the sale, so what the mini
    // owes and their markup stay fixed against later rate changes.
    const liveRate = (await this.currencyService.getRate())?.usdToFcRate ?? '1';
    const fcOf = (usd: Decimal, snapshot: string | null): Decimal =>
      usd.mul(new Decimal(snapshot ?? liveRate));

    const soldMap = new Map<
      string,
      {
        productName: string;
        variantId: string | null;
        variantLabel: string | null;
        qtySold: number;
        revenue: Decimal;
        agreedValue: Decimal;
        profit: Decimal;
        agreedValueFc: Decimal;
        profitFc: Decimal;
      }
    >();
    for (const s of sales) {
      const k = keyOf(s.variantId, s.productName);
      const cur =
        soldMap.get(k) ??
        {
          productName: s.productName,
          variantId: s.variantId ?? null,
          variantLabel: s.variantLabel ?? null,
          qtySold: 0,
          revenue: new Decimal(0),
          agreedValue: new Decimal(0),
          profit: new Decimal(0),
          agreedValueFc: new Decimal(0),
          profitFc: new Decimal(0),
        };
      const agreed = new Decimal(s.unitCost).mul(s.qtySold);
      const profit = new Decimal(s.profit);
      cur.qtySold += s.qtySold;
      cur.revenue = cur.revenue.plus(new Decimal(s.salePrice).mul(s.qtySold));
      cur.agreedValue = cur.agreedValue.plus(agreed);
      cur.profit = cur.profit.plus(profit);
      cur.agreedValueFc = cur.agreedValueFc.plus(fcOf(agreed, s.usdToFcRateSnapshot));
      cur.profitFc = cur.profitFc.plus(fcOf(profit, s.usdToFcRateSnapshot));
      soldMap.set(k, cur);
    }
    const sold: HandoverSoldLine[] = [...soldMap.entries()].map(([k, v]) => ({
      productName: v.productName,
      variantId: v.variantId,
      variantLabel: v.variantLabel,
      qtySold: v.qtySold,
      piecesPerCarton: ppcByKey.get(k) ?? null,
      revenue: v.revenue.toFixed(4),
      agreedValue: v.agreedValue.toFixed(4),
      profit: v.profit.toFixed(4),
      agreedValueFc: v.agreedValueFc.toFixed(4),
      profitFc: v.profitFc.toFixed(4),
    }));
    const cashForSold = sold
      .reduce((sum, x) => sum.plus(new Decimal(x.agreedValue)), new Decimal(0))
      .toFixed(4);
    const profitMade = sold
      .reduce((sum, x) => sum.plus(new Decimal(x.profit)), new Decimal(0))
      .toFixed(4);
    const cashForSoldFc = sold
      .reduce((sum, x) => sum.plus(new Decimal(x.agreedValueFc)), new Decimal(0))
      .toFixed(4);
    const profitMadeFc = sold
      .reduce((sum, x) => sum.plus(new Decimal(x.profitFc)), new Decimal(0))
      .toFixed(4);

    // Unsold units still held, grouped by product. Carton size comes from the
    // shared ppcByProduct map (any non-null lot) so returns and sold agree.
    const retMap = new Map<
      string,
      { productName: string; variantId: string | null; quantity: number }
    >();
    for (const e of inEntries) {
      if (e.quantityRemaining <= 0) continue;
      const k = keyOf(e.variantId, e.productName);
      const cur = retMap.get(k) ?? { productName: e.productName, variantId: e.variantId ?? null, quantity: 0 };
      cur.quantity += e.quantityRemaining;
      retMap.set(k, cur);
    }
    const returns: HandoverReturnLine[] = [...retMap.entries()].map(([k, v]) => ({
      productName: v.productName,
      variantId: v.variantId,
      variantLabel: v.variantId ? retLabels.get(v.variantId) ?? null : null,
      quantity: v.quantity,
      piecesPerCarton: ppcByKey.get(k) ?? null,
    }));

    const pendingExp = await this.miniExpenseRepo.find({
      where: { miniId, settlementId: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const expenses: HandoverExpenseLine[] = pendingExp.map((e) => ({
      category: e.category,
      description: e.description ?? null,
      amount: new Decimal(e.amount).toFixed(4),
    }));
    const expensesFc = pendingExp
      .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0))
      .toFixed(4);

    return {
      sold,
      returns,
      cashForSold,
      profitMade,
      cashForSoldFc,
      profitMadeFc,
      expensesFc,
      expenses,
    };
  }

  // ─── Mini employee: record / list / remove pending expenses (FC) ───────────

  async createExpense(ctx: ActorContext, dto: CreateMiniExpenseDto): Promise<MiniExpense> {
    const miniId = ctx.effectiveOwnerId;
    if (!ctx.employment) {
      throw new ForbiddenException('Only a mini employee can record handover expenses');
    }
    const ownerId = ctx.employment.employerId;

    // Idempotent for offline retries.
    if (dto.clientId) {
      const existing = await this.miniExpenseRepo.findOne({
        where: { miniId, clientId: dto.clientId },
      });
      if (existing) return existing;
    }

    // Gate: only while the mini currently holds goods from the employer
    // (they owe an outstanding balance for this cycle).
    const debt = await this.supplierDebtRepo.findOne({
      where: { ownerId: miniId, supplierUserId: ownerId },
    });
    const outstanding = debt ? new Decimal(debt.outstandingBalance) : new Decimal(0);
    if (outstanding.lte(0)) {
      throw new BadRequestException(
        'You can only record expenses while you have products from your employer to sell',
      );
    }

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const expense = this.miniExpenseRepo.create({
      miniId,
      ownerId,
      amount: amount.toFixed(4),
      category: dto.category,
      description: dto.description ?? null,
      clientId: dto.clientId ?? null,
      settlementId: null,
      bookedExpenseId: null,
    });
    return this.miniExpenseRepo.save(expense);
  }

  async listPendingExpenses(ctx: ActorContext): Promise<MiniExpense[]> {
    return this.miniExpenseRepo.find({
      where: { miniId: ctx.effectiveOwnerId, settlementId: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /** Every expense the mini has ever recorded — pending AND already handed over
   *  (settlementId set). Powers the mini's full expense history screen. */
  async listAllExpenses(ctx: ActorContext): Promise<MiniExpense[]> {
    return this.miniExpenseRepo.find({
      where: { miniId: ctx.effectiveOwnerId },
      order: { createdAt: 'DESC' },
    });
  }

  async removeExpense(ctx: ActorContext, id: string): Promise<void> {
    const expense = await this.miniExpenseRepo.findOne({
      where: { id, miniId: ctx.effectiveOwnerId },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.settlementId) {
      throw new BadRequestException('This expense is already part of a submitted handover');
    }
    await this.miniExpenseRepo.remove(expense);
  }

  // ─── Owner/full employee: list incoming handovers ──────────────────────────

  async findIncoming(ctx: ActorContext): Promise<MiniSettlement[]> {
    return this.settlementRepo.find({
      where: { ownerId: ctx.effectiveOwnerId },
      relations: { mini: true, items: true, payment: true, expenses: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Owner/full employee: approve a handover (atomic) ──────────────────────

  async approve(ctx: ActorContext, id: string): Promise<MiniSettlement> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const settlement = await this.settlementRepo.findOne({
      where: { id, status: MiniSettlementStatus.PENDING },
      relations: { items: true },
    });
    if (!settlement) throw new NotFoundException('Pending handover not found');
    if (settlement.ownerId !== ownerId) {
      throw new ForbiddenException('This handover is not addressed to you');
    }
    const miniId = settlement.miniId;

    return this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(DebtorCredit, {
        where: { ownerId, debtorUserId: miniId },
      });
      if (!credit) {
        throw new BadRequestException('No credit record found for this mini employee');
      }
      // Mirror debt on the mini's books (created alongside the CONSIGNED_IN entry).
      const debt = await manager.findOne(SupplierDebt, {
        where: { ownerId: miniId, supplierUserId: ownerId },
      });

      // ── Returns: unsold goods flow back to the owner's sellable stock ──
      for (const item of settlement.items) {
        const qty = item.quantity;
        // Sized products match every lookup by size (variantId); simple by name.
        const bySource = (ownerIdArg: string, source: InventorySource, extra: Record<string, unknown> = {}) =>
          item.variantId
            ? { ownerId: ownerIdArg, variantId: item.variantId, source, ...extra }
            : { ownerId: ownerIdArg, productName: ILike(item.productName), source, ...extra };

        // Mini side: deduct the returned qty from their CONSIGNED_IN stock (FIFO).
        const miniEntries = (
          await manager.find(InventoryEntry, {
            where: bySource(miniId, InventorySource.CONSIGNED_IN),
            order: { createdAt: 'ASC' },
          })
        ).filter((e) => e.quantityRemaining > 0);
        const available = miniEntries.reduce((sum, e) => sum + e.quantityRemaining, 0);
        if (available < qty) {
          throw new BadRequestException(
            `Mini employee no longer has ${qty} unsold "${item.productName}" (has ${available})`,
          );
        }
        // Reverse the debt at each lot's OWN agreed price as we FIFO-deduct.
        // Returned units can span batches consigned at different agreed prices
        // (multi-batch, same product); valuing them all at a single snapshot
        // price leaves a residual so "Owes you" never fully clears even though
        // no goods remain. Accumulating per-lot keeps the debt exact.
        let remaining = qty;
        let returnValueDec = new Decimal(0);
        for (const entry of miniEntries) {
          if (remaining === 0) break;
          const deduct = Math.min(entry.quantityRemaining, remaining);
          const before = entry.quantityRemaining;
          entry.quantityRemaining -= deduct;
          remaining -= deduct;
          returnValueDec = returnValueDec.plus(new Decimal(entry.unitCost).mul(deduct));
          await manager.save(InventoryEntry, entry);
          await this.stockMovements.record(manager, {
            ownerId: miniId,
            entry,
            reason: StockMovementReason.CONSIGN_RETURN_OUT,
            qty: deduct,
            qtyBefore: before,
          });
        }

        // Owner side: wind down the CONSIGNED_OUT tracking entries (FIFO, best-effort).
        const ownerOut = (
          await manager.find(InventoryEntry, {
            where: bySource(ownerId, InventorySource.CONSIGNED_OUT, { debtorUserId: miniId }),
            order: { createdAt: 'ASC' },
          })
        ).filter((e) => e.quantityRemaining > 0);
        let toReduce = qty;
        for (const entry of ownerOut) {
          if (toReduce === 0) break;
          const dec = Math.min(entry.quantityRemaining, toReduce);
          entry.quantityRemaining -= dec;
          toReduce -= dec;
          await manager.save(InventoryEntry, entry);
        }

        // Returns rejoin the owner's OWN stock by increasing the QUANTITY on
        // their existing lot for this product — never creating a new lot priced
        // at the mini's agreed price. A return adjusts quantities only; the
        // owner's cost + selling prices are left untouched. Prefer a PERSONAL
        // lot, then SUPPLIER; only fall back to a fresh lot if the owner has
        // none (rare — they must have held it to consign it).
        let restockLot = await manager.findOne(InventoryEntry, {
          where: bySource(ownerId, InventorySource.PERSONAL),
          order: { createdAt: 'DESC' },
        });
        if (!restockLot) {
          restockLot = await manager.findOne(InventoryEntry, {
            where: bySource(ownerId, InventorySource.SUPPLIER),
            order: { createdAt: 'DESC' },
          });
        }

        let qtyBefore: number;
        if (restockLot) {
          qtyBefore = restockLot.quantityRemaining;
          restockLot.quantityRemaining += qty;
          restockLot.quantityOriginal += qty;
          restockLot = await manager.save(InventoryEntry, restockLot);
        } else {
          // No existing lot — recreate one at the owner's original cost. Use the
          // cost (not the mini's agreed price) as the selling-price placeholder.
          // Carry the group/size tags so a sized return re-groups correctly.
          const ownerCost = ownerOut[0]?.unitCost ?? item.agreedUnitPrice;
          qtyBefore = 0;
          restockLot = await manager.save(
            InventoryEntry,
            manager.create(InventoryEntry, {
              ownerId,
              source: InventorySource.PERSONAL,
              productName: item.productName,
              groupId: item.variantId ? ownerOut[0]?.groupId ?? null : null,
              variantId: item.variantId ?? null,
              unitCost: ownerCost,
              sellingPrice: ownerCost,
              category: null,
              quantityOriginal: qty,
              quantityRemaining: qty,
              piecesPerCarton: ownerOut[0]?.piecesPerCarton ?? null,
              actorId,
            }),
          );
        }
        await this.stockMovements.record(manager, {
          ownerId,
          entry: restockLot,
          reason: StockMovementReason.CONSIGN_RETURN_IN,
          qty,
          qtyBefore,
        });

        // Record on the settlement item the owner's original cost for the
        // returned units (audit) — not the mini's agreed price.
        item.unitCost = ownerOut[0]?.unitCost ?? item.agreedUnitPrice;
        await manager.save(MiniSettlementItem, item);

        // Debt reversal: the mini no longer owes for the returned units. Reduce
        // both totalCreditGiven and outstanding so the invariant holds
        // (outstanding = totalCreditGiven − totalReceived). Value is the per-lot
        // sum accumulated above, not a single snapshot price.
        const returnValue = returnValueDec.toFixed(4);
        credit.totalCreditGiven = new Decimal(credit.totalCreditGiven).minus(returnValue).toFixed(4);
        credit.outstandingBalance = new Decimal(credit.outstandingBalance).minus(returnValue).toFixed(4);
        if (debt) {
          debt.totalCreditReceived = new Decimal(debt.totalCreditReceived).minus(returnValue).toFixed(4);
          debt.outstandingBalance = new Decimal(debt.outstandingBalance).minus(returnValue).toFixed(4);
        }
      }

      // ── Cash: books once as a differentiated DEBTOR_TO_OWNER payment ──
      const cash = new Decimal(settlement.cashAmount);
      if (cash.gt(0)) {
        credit.totalReceived = new Decimal(credit.totalReceived).plus(cash).toFixed(4);
        credit.outstandingBalance = new Decimal(credit.outstandingBalance).minus(cash).toFixed(4);
        if (debt) {
          debt.totalPaid = new Decimal(debt.totalPaid).plus(cash).toFixed(4);
          debt.outstandingBalance = new Decimal(debt.outstandingBalance).minus(cash).toFixed(4);
        }
      }

      await manager.save(DebtorCredit, credit);
      if (debt) await manager.save(SupplierDebt, debt);

      if (cash.gt(0)) {
        const payment = manager.create(Payment, {
          amount: cash.toFixed(4),
          note: settlement.note ?? 'Mini-employee handover',
          direction: PaymentDirection.DEBTOR_TO_OWNER,
          status: PaymentStatus.APPROVED,
          remainingBalance: credit.outstandingBalance,
          debtorCreditId: credit.id,
          paidByUserId: miniId,
          paidToUserId: ownerId,
          actorId,
        });
        const savedPayment = await manager.save(Payment, payment);
        settlement.paymentId = savedPayment.id;
      }

      // ── Expenses: the mini's claimed expenses book as the owner's FC
      // business expenses (attributed to the mini). The cash payment above is
      // the full sold value; these expenses net it down to what the mini
      // physically hands over. ──
      const rateRow = await this.currencyService.getRate();
      const systemRate = rateRow?.usdToFcRate ?? null;
      const claimedExpenses = await manager.find(MiniExpense, {
        where: { settlementId: settlement.id },
      });
      for (const me of claimedExpenses) {
        const booked = manager.create(Expense, {
          ownerId,
          actorId: me.miniId,
          amount: new Decimal(me.amount).toFixed(4),
          currency: ExpenseCurrency.FC,
          category: (me.category as ExpenseCategory) ?? ExpenseCategory.OTHER,
          description: me.description ?? null,
          usdToFcRateSnapshot: systemRate ? new Decimal(systemRate).toFixed(4) : null,
          date: new Date(),
        });
        const savedExpense = await manager.save(Expense, booked);
        me.bookedExpenseId = savedExpense.id;
        await manager.save(MiniExpense, me);
      }

      settlement.status = MiniSettlementStatus.APPROVED;
      settlement.approvedAt = new Date();
      settlement.actorId = actorId;
      return manager.save(MiniSettlement, settlement);
    });
  }

  // ─── Owner/full employee: real-time activity for one mini employee ─────────

  async miniActivity(
    ctx: ActorContext,
    miniUserId: string,
    query: MiniActivityQueryDto,
  ): Promise<MiniActivity> {
    const ownerId = ctx.effectiveOwnerId;

    // Authorize: the caller must employ this mini. Reading the mini's own books
    // is only permitted through the employment relationship.
    const employment = await this.employmentRepo.findOne({
      where: { employerId: ownerId, employeeId: miniUserId },
      relations: { employee: true },
    });
    if (!employment) {
      throw new ForbiddenException('This mini employee is not one of yours');
    }

    const from = query.dateFrom ? new Date(query.dateFrom) : null;
    // Accept both a date-only bound (YYYY-MM-DD → end of that day) and a full
    // ISO timestamp — the dashboard's handover-window navigator passes precise
    // cycle boundaries (a handover's approval instant), not just a calendar day.
    const to = query.dateTo
      ? new Date(query.dateTo.includes('T') ? query.dateTo : query.dateTo + 'T23:59:59.999')
      : null;

    // Sales the mini recorded on their own books within the window.
    const saleQb = this.saleRepo
      .createQueryBuilder('s')
      .where('s.owner_id = :miniUserId', { miniUserId })
      .orderBy('s.created_at', 'DESC');
    if (from) saleQb.andWhere('s.created_at >= :from', { from });
    if (to) saleQb.andWhere('s.created_at <= :to', { to });
    const saleRows = await saleQb.getMany();

    // Live rate — fallback for any pre-snapshot rows. Each row's FC value uses
    // its own batch's locked rate so multi-batch totals are exact per batch.
    const liveRate = (await this.currencyService.getRate())?.usdToFcRate ?? '1';
    const fcOf = (usd: Decimal, snapshot: string | null): Decimal =>
      usd.mul(new Decimal(snapshot ?? liveRate));

    let soldUnits = 0;
    let soldAtSalePrice = new Decimal(0);
    let soldAtAgreedPrice = new Decimal(0);
    let markup = new Decimal(0);
    let soldAtSalePriceFc = new Decimal(0);
    let soldAtAgreedPriceFc = new Decimal(0);
    let markupFc = new Decimal(0);
    const sales: MiniActivitySale[] = saleRows.map((s) => {
      const saleTotal = new Decimal(s.salePrice).mul(s.qtySold);
      const agreedTotal = new Decimal(s.unitCost).mul(s.qtySold);
      const profit = new Decimal(s.profit);
      soldUnits += s.qtySold;
      soldAtSalePrice = soldAtSalePrice.plus(saleTotal);
      // For a mini's consigned-in sale, unitCost == the agreed price they owe.
      soldAtAgreedPrice = soldAtAgreedPrice.plus(agreedTotal);
      markup = markup.plus(profit);
      soldAtSalePriceFc = soldAtSalePriceFc.plus(fcOf(saleTotal, s.usdToFcRateSnapshot));
      soldAtAgreedPriceFc = soldAtAgreedPriceFc.plus(fcOf(agreedTotal, s.usdToFcRateSnapshot));
      markupFc = markupFc.plus(fcOf(profit, s.usdToFcRateSnapshot));
      return {
        id: s.id,
        productName: s.productName,
        qtySold: s.qtySold,
        salePrice: new Decimal(s.salePrice).toFixed(4),
        agreedUnitPrice: new Decimal(s.unitCost).toFixed(4),
        markup: new Decimal(s.profit).toFixed(4),
        usdToFcRateSnapshot: s.usdToFcRateSnapshot ?? null,
        date: s.date,
      };
    });

    // Value given to the mini within the window (owner-side CONSIGNED_OUT).
    const givenQb = this.entryRepo
      .createQueryBuilder('e')
      .where('e.owner_id = :ownerId', { ownerId })
      .andWhere('e.source = :src', { src: InventorySource.CONSIGNED_OUT })
      .andWhere('e.debtor_user_id = :miniUserId', { miniUserId });
    // "What you gave" shares the selected window with the sales feed — the
    // dashboard navigator scopes both to one handover cycle at a time.
    if (from) givenQb.andWhere('e.created_at >= :from', { from });
    if (to) givenQb.andWhere('e.created_at <= :to', { to });
    givenQb.orderBy('e.created_at', 'DESC');
    const givenEntries = await givenQb.getMany();
    let givenInPeriod = new Decimal(0);
    let givenInPeriodFc = new Decimal(0);
    let givenUnitsInPeriod = 0;
    const given: MiniActivityGiven[] = givenEntries.map((e) => {
      const agreedValue = new Decimal(e.sellingPrice).mul(e.quantityOriginal);
      givenInPeriod = givenInPeriod.plus(agreedValue);
      givenInPeriodFc = givenInPeriodFc.plus(fcOf(agreedValue, e.usdToFcRateSnapshot));
      givenUnitsInPeriod += e.quantityOriginal;
      return {
        productName: e.productName,
        quantity: e.quantityOriginal,
        agreedUnitPrice: new Decimal(e.sellingPrice).toFixed(4),
        usdToFcRateSnapshot: e.usdToFcRateSnapshot ?? null,
        agreedValueFc: fcOf(agreedValue, e.usdToFcRateSnapshot).toFixed(4),
        date: e.createdAt,
      };
    });

    // Current (point-in-time) debt + unsold stock still with the mini.
    const credit = await this.debtorCreditRepo.findOne({
      where: { ownerId, debtorUserId: miniUserId },
    });
    const inEntries = await this.entryRepo.find({
      where: { ownerId: miniUserId, source: InventorySource.CONSIGNED_IN },
    });
    const stillOutUnits = inEntries.reduce((sum, e) => sum + e.quantityRemaining, 0);

    return {
      miniUserId,
      miniUsername: employment.employee?.username ?? '',
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      givenInPeriod: givenInPeriod.toFixed(4),
      givenUnitsInPeriod,
      given,
      outstanding: credit ? new Decimal(credit.outstandingBalance).toFixed(4) : '0.0000',
      totalCreditGiven: credit ? new Decimal(credit.totalCreditGiven).toFixed(4) : '0.0000',
      totalReceived: credit ? new Decimal(credit.totalReceived).toFixed(4) : '0.0000',
      stillOutUnits,
      soldUnits,
      soldAtSalePrice: soldAtSalePrice.toFixed(4),
      soldAtAgreedPrice: soldAtAgreedPrice.toFixed(4),
      markup: markup.toFixed(4),
      givenInPeriodFc: givenInPeriodFc.toFixed(4),
      soldAtSalePriceFc: soldAtSalePriceFc.toFixed(4),
      soldAtAgreedPriceFc: soldAtAgreedPriceFc.toFixed(4),
      markupFc: markupFc.toFixed(4),
      sales,
    };
  }

  // ─── Owner/full employee: reject a handover ────────────────────────────────

  async reject(ctx: ActorContext, id: string): Promise<MiniSettlement> {
    const ownerId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== ownerId ? ctx.actorId : null;

    const settlement = await this.settlementRepo.findOne({
      where: { id, status: MiniSettlementStatus.PENDING },
    });
    if (!settlement) throw new NotFoundException('Pending handover not found');
    if (settlement.ownerId !== ownerId) {
      throw new ForbiddenException('This handover is not addressed to you');
    }
    // Release the claimed expenses back to pending so the mini can re-submit.
    await this.miniExpenseRepo.update({ settlementId: id }, { settlementId: null });
    settlement.status = MiniSettlementStatus.REJECTED;
    settlement.actorId = actorId;
    return this.settlementRepo.save(settlement);
  }
}
