import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, IsNull, Not, Repository } from 'typeorm';
import {
  ConsignmentRequest,
  ConsignmentStatus,
  CustodyTeamMember,
  Employment,
  EmploymentStatus,
  EmploymentTier,
  InventoryEntry,
  InventorySource,
  SaleApprovalStatus,
  SaleTransaction,
  StockCustody,
  StockCustodyStatus,
  StockIssue,
  StockIssueItem,
  StockIssueStatus,
  StockMovementReason,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { holderCond, holderScope, readScope, requireShop, writeScope } from '../common/shop-scope';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { BranchTransfersService } from '../branch-transfers/branch-transfers.service';
import { AppointCustodianDto } from './dto/appoint-custodian.dto';
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { RejectStockIssueDto } from './dto/reject-stock-issue.dto';
import { AddCustodyTeamMemberDto } from './dto/add-team-member.dto';
import { ApproveSalesDto } from './dto/approve-sales.dto';

/** One product line of what a custodian is currently holding. */
export interface CustodyVolumeLine {
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  quantityRemaining: number;
  unitCost: string;
  sellingPrice: string;
  piecesPerCarton: number | null;
  entryIds: string[];
}

/** The custodian's own view: their volume, and nothing about the rest of the branch. */
export interface CustodyOverview {
  custody: StockCustody;
  lines: CustodyVolumeLine[];
  totalUnits: number;
  /** Sales from this volume still awaiting the custodian's attestation. */
  pendingSaleCount: number;
  /** Volumes offered but not yet accepted or refused. */
  pendingIssueCount: number;
  teamSize: number;
}

/** Sellable stock sources — a consigned lot is never issued into custody. */
const SHELF_SOURCES = [InventorySource.SUPPLIER, InventorySource.PERSONAL];

/**
 * Shop custody: making one full employee accountable for a named volume of a
 * branch's stock. See `SHOP_CUSTODY_PLAN.md`.
 *
 * The invariant this service exists to hold: **custody narrows, it never
 * widens**. `custodian_id` is a third axis beside tenancy `(org_id, shop_id)`
 * and holder `owner_id` — every read here still goes through `readScope` or
 * `holderScope` first, and custody is applied on top. It is never a tenancy key.
 */
@Injectable()
export class CustodyService {
  constructor(
    @InjectRepository(StockCustody)
    private readonly custodyRepo: Repository<StockCustody>,
    @InjectRepository(StockIssue)
    private readonly issueRepo: Repository<StockIssue>,
    @InjectRepository(CustodyTeamMember)
    private readonly teamRepo: Repository<CustodyTeamMember>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(Employment)
    private readonly employmentRepo: Repository<Employment>,
    @InjectRepository(ConsignmentRequest)
    private readonly consignmentRepo: Repository<ConsignmentRequest>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
    private readonly branchTransfers: BranchTransfersService,
  ) {}

  // ─── Appointment ───────────────────────────────────────────────────────────

  /**
   * Make a full employee the man in charge of this branch's stock.
   *
   * The unique partial index is the real guard against two open custodies at
   * one branch; the check here exists to return a sentence instead of a
   * constraint violation, and the catch below covers the race between them.
   */
  async appoint(ctx: ActorContext, dto: AppointCustodianDto): Promise<StockCustody> {
    const shopId = requireShop(ctx);
    const employment = await this.requireFullEmploymentAtShop(ctx, dto.custodianId, shopId);

    const existing = await this.custodyRepo.findOne({
      where: { ...readScope(ctx), shopId, status: StockCustodyStatus.OPEN },
    });
    if (existing) {
      throw new ConflictException(
        'This branch already has an active custodian — end that custody first',
      );
    }

    const custody = this.custodyRepo.create({
      ...writeScope(ctx),
      custodianId: employment.employeeId,
      status: StockCustodyStatus.OPEN,
      appointedById: ctx.actorId,
      note: dto.note?.trim() || null,
      openedAt: new Date(),
    });

    let saved: StockCustody;
    try {
      saved = await this.custodyRepo.save(custody);
    } catch {
      // Lost the race to the partial unique index.
      throw new ConflictException(
        'This branch already has an active custodian — end that custody first',
      );
    }

    if (dto.sweepExistingStock) {
      await this.createOpeningSweep(ctx, saved);
    }
    return saved;
  }

  /** The branch's current custody, for the owner. Null when nobody is appointed. */
  async current(ctx: ActorContext): Promise<StockCustody | null> {
    return this.custodyRepo.findOne({
      where: { ...readScope(ctx), status: StockCustodyStatus.OPEN },
      relations: { custodian: true },
    });
  }

  /**
   * The custodian's own view. Deliberately scoped to their volume and nothing
   * else: an employee holding stock sees what they are answerable for, not the
   * branch's cash or the business's numbers.
   */
  async mine(ctx: ActorContext): Promise<CustodyOverview | null> {
    const custody = await this.custodyRepo.findOne({
      where: {
        ...readScope(ctx),
        custodianId: ctx.actorId,
        status: StockCustodyStatus.OPEN,
      },
      relations: { custodian: true },
    });
    if (!custody) return null;

    const entries = await this.entryRepo.find({
      where: { ...holderScope(ctx), custodianId: ctx.actorId },
      relations: { variant: true },
      order: { createdAt: 'ASC' },
    });

    const byKey = new Map<string, CustodyVolumeLine>();
    for (const e of entries) {
      if (e.quantityRemaining <= 0) continue;
      const key = `${e.productName}::${e.variantId ?? ''}`;
      const line = byKey.get(key);
      if (line) {
        line.quantityRemaining += e.quantityRemaining;
        line.entryIds.push(e.id);
      } else {
        byKey.set(key, {
          productName: e.productName,
          variantId: e.variantId,
          variantLabel: e.variant?.label ?? null,
          quantityRemaining: e.quantityRemaining,
          unitCost: e.unitCost,
          sellingPrice: e.sellingPrice,
          // A size's carton count lives on its variant (the lot's own column is
          // often empty for sized stock) — branch-transfer carton picking needs it.
          piecesPerCarton: e.variant?.piecesPerCarton ?? e.piecesPerCarton,
          entryIds: [e.id],
        });
      }
    }
    const lines = [...byKey.values()];

    const [pendingSaleCount, pendingIssueCount, teamSize] = await Promise.all([
      this.saleRepo.count({
        where: { custodyId: custody.id, approvalStatus: SaleApprovalStatus.PENDING, rejectedAt: IsNull() },
      }),
      this.issueRepo.count({ where: { custodyId: custody.id, status: StockIssueStatus.PENDING } }),
      this.teamRepo.count({ where: { custodyId: custody.id, removedAt: IsNull() } }),
    ]);

    return {
      custody,
      lines,
      totalUnits: lines.reduce((sum, l) => sum + l.quantityRemaining, 0),
      pendingSaleCount,
      pendingIssueCount,
      teamSize,
    };
  }

  /**
   * End the appointment. Refused while the custodian still holds goods or has
   * sales nobody has attested to — the point of custody is that it closes
   * deliberately, with the books square, not by being switched off.
   */
  async close(ctx: ActorContext, id: string): Promise<StockCustody> {
    const custody = await this.ownedCustody(ctx, id);
    if (custody.status === StockCustodyStatus.CLOSED) return custody;

    // `holderCond` and not a bare branch filter: `inventory_entries` is one of
    // the five holder tables, and a branch-only read there pools in lots that
    // sit at this shop on someone else's books (MULTI_SHOP_PLAN.md §3.2).
    // Custody narrows on top of the holder, it never stands in for it.
    const held = await this.entryRepo
      .createQueryBuilder('e')
      .where(...holderCond('e', ctx))
      .andWhere('e.custodianId = :cid', { cid: custody.custodianId })
      .andWhere('e.quantityRemaining > 0')
      .getCount();
    if (held > 0) {
      throw new ConflictException(
        'This custodian is still holding stock — settle a handover before ending the custody',
      );
    }

    const unattested = await this.saleRepo.count({
      where: { custodyId: custody.id, approvalStatus: SaleApprovalStatus.PENDING, rejectedAt: IsNull() },
    });
    if (unattested > 0) {
      throw new ConflictException('Approve or reject the outstanding sales before ending the custody');
    }

    if (await this.branchTransfers.custodyHasTransferInTransit(custody.id)) {
      throw new ConflictException(
        'Goods sent from this volume to another branch are still in transit — wait until they are received or rejected',
      );
    }

    custody.status = StockCustodyStatus.CLOSED;
    custody.closedAt = new Date();
    return this.custodyRepo.save(custody);
  }

  // ─── Issuing a volume ──────────────────────────────────────────────────────

  async createIssue(
    ctx: ActorContext,
    custodyId: string,
    dto: CreateStockIssueDto,
  ): Promise<StockIssue> {
    const custody = await this.ownedCustody(ctx, custodyId);
    this.assertOpen(custody);
    return this.buildIssue(ctx, custody, dto.items, dto.note?.trim() || null, false);
  }

  /**
   * "Take over the shop's existing stock" as one offer: every unassigned lot at
   * the branch, named line by line with its own `sourceEntryId` so acceptance
   * moves exactly the lots that were shown, not whatever priority would pick by
   * the time they say yes.
   */
  private async createOpeningSweep(
    ctx: ActorContext,
    custody: StockCustody,
  ): Promise<StockIssue | null> {
    const lots = await this.entryRepo.find({
      where: SHELF_SOURCES.map((source) => ({
        ...holderScope(ctx),
        shopId: custody.shopId,
        custodianId: IsNull(),
        source,
      })),
      relations: { variant: true },
      order: { createdAt: 'ASC' },
    });
    const items = lots
      .filter((e) => e.quantityRemaining > 0)
      .map((e) => ({
        productName: e.productName,
        quantity: e.quantityRemaining,
        variantId: e.variantId ?? undefined,
        sourceEntryId: e.id,
      }));
    if (items.length === 0) return null;
    return this.buildIssue(ctx, custody, items, 'Opening stock', true);
  }

  private async buildIssue(
    ctx: ActorContext,
    custody: StockCustody,
    items: CreateStockIssueDto['items'],
    note: string | null,
    isOpeningSweep: boolean,
  ): Promise<StockIssue> {
    const issue = this.issueRepo.create({
      orgId: custody.orgId,
      shopId: custody.shopId,
      custodyId: custody.id,
      status: StockIssueStatus.PENDING,
      issuedById: ctx.actorId,
      isOpeningSweep,
      note,
      items: items.map((i) =>
        ({
          productName: i.productName.trim().toLowerCase(),
          quantity: i.quantity,
          variantId: i.variantId ?? null,
          variantLabel: null,
          sourceEntryId: i.sourceEntryId ?? null,
        }) as StockIssueItem,
      ),
    });
    return this.issueRepo.save(issue);
  }

  /** Volumes offered to me and not yet answered — the custodian's inbox. */
  async myIssues(ctx: ActorContext): Promise<StockIssue[]> {
    const custody = await this.custodyRepo.findOne({
      where: { ...readScope(ctx), custodianId: ctx.actorId, status: StockCustodyStatus.OPEN },
    });
    if (!custody) return [];
    return this.issueRepo.find({
      where: { custodyId: custody.id, status: StockIssueStatus.PENDING },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  async listIssues(ctx: ActorContext, custodyId: string): Promise<StockIssue[]> {
    const custody = await this.ownedCustody(ctx, custodyId);
    return this.issueRepo.find({
      where: { custodyId: custody.id },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * The custodian takes the volume. One transaction: each line draws from
   * unassigned lots at the branch (SUPPLIER-first, business rule 2), and a
   * mirror entry is created carrying the SAME `source` and `unit_cost` with
   * `custodian_id` set.
   *
   * Carrying the cost verbatim is the whole point (§3.1). A mini's
   * `CONSIGNED_IN` lot re-bases cost to the agreed price, which is why a mini's
   * sale shows the mini's margin; custody must not, because the owner's profit
   * on a sale their employee made is the real profit at the real cost.
   */
  async acceptIssue(ctx: ActorContext, issueId: string): Promise<StockIssue> {
    const issue = await this.issueForCustodian(ctx, issueId);
    if (issue.status !== StockIssueStatus.PENDING) {
      throw new ConflictException('This volume has already been answered');
    }

    return this.dataSource.transaction(async (manager) => {
      const custody = await manager.findOne(StockCustody, { where: { id: issue.custodyId } });
      if (!custody) throw new NotFoundException('Custody not found');
      this.assertOpen(custody);

      for (const item of issue.items) {
        let needed = item.quantity;
        const lots = await this.unassignedLots(manager, custody, item);

        for (const lot of lots) {
          if (needed <= 0) break;
          const take = Math.min(needed, lot.quantityRemaining);
          if (take <= 0) continue;

          const before = lot.quantityRemaining;
          lot.quantityRemaining = before - take;
          await manager.save(InventoryEntry, lot);
          await this.stockMovements.record(manager, {
            ownerId: lot.ownerId,
            entry: lot,
            reason: StockMovementReason.CUSTODY_OUT,
            qty: take,
            qtyBefore: before,
            notes: `Issued into custody`,
          });

          const held = manager.create(InventoryEntry, {
            source: lot.source,
            productName: lot.productName,
            unitCost: lot.unitCost,
            sellingPrice: lot.sellingPrice,
            category: lot.category,
            quantityOriginal: take,
            quantityRemaining: take,
            cartonPrice: lot.cartonPrice,
            piecesPerCarton: lot.piecesPerCarton,
            usdToFcRateSnapshot: lot.usdToFcRateSnapshot,
            ownerId: lot.ownerId,
            orgId: lot.orgId,
            shopId: lot.shopId,
            custodianId: custody.custodianId,
            supplierUserId: lot.supplierUserId,
            supplierDebtId: lot.supplierDebtId,
            groupId: lot.groupId,
            variantId: lot.variantId,
            actorId: ctx.actorId,
          });
          const savedHeld = await manager.save(InventoryEntry, held);
          await this.stockMovements.record(manager, {
            ownerId: savedHeld.ownerId,
            entry: savedHeld,
            reason: StockMovementReason.CUSTODY_IN,
            qty: take,
            qtyBefore: 0,
            notes: `Received into custody`,
          });

          needed -= take;
        }

        if (needed > 0) {
          throw new BadRequestException(
            `Not enough unassigned stock for "${item.productName}" — ${needed} short`,
          );
        }
      }

      issue.status = StockIssueStatus.ACCEPTED;
      issue.acceptedAt = new Date();
      return manager.save(StockIssue, issue);
    });
  }

  async rejectIssue(
    ctx: ActorContext,
    issueId: string,
    dto: RejectStockIssueDto,
  ): Promise<StockIssue> {
    const issue = await this.issueForCustodian(ctx, issueId);
    if (issue.status !== StockIssueStatus.PENDING) {
      throw new ConflictException('This volume has already been answered');
    }
    issue.status = StockIssueStatus.REJECTED;
    issue.rejectedAt = new Date();
    issue.rejectionReason = dto.reason?.trim() || null;
    return this.issueRepo.save(issue);
  }

  async cancelIssue(ctx: ActorContext, issueId: string): Promise<StockIssue> {
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, ...readScope(ctx) },
      relations: { items: true },
    });
    if (!issue) throw new NotFoundException('Volume not found');
    if (issue.status !== StockIssueStatus.PENDING) {
      throw new ConflictException('Only a volume still waiting for an answer can be withdrawn');
    }
    issue.status = StockIssueStatus.CANCELLED;
    issue.cancelledAt = new Date();
    return this.issueRepo.save(issue);
  }

  // ─── The team ──────────────────────────────────────────────────────────────

  async team(ctx: ActorContext, custodyId: string): Promise<CustodyTeamMember[]> {
    const custody = await this.custodyReadableBy(ctx, custodyId);
    return this.teamRepo.find({
      where: { custodyId: custody.id, removedAt: IsNull() },
      relations: { user: true },
      order: { addedAt: 'ASC' },
    });
  }

  /**
   * Let someone sell from this volume. The custodian runs their own team; the
   * owner can also add people, including themselves — an owner who works the
   * counter of a branch he has put someone else in charge of is ordinary, and
   * his sales must land against that volume or the stock figures drift.
   */
  async addTeamMember(
    ctx: ActorContext,
    custodyId: string,
    dto: AddCustodyTeamMemberDto,
  ): Promise<CustodyTeamMember> {
    const custody = await this.custodyWritableBy(ctx, custodyId);
    this.assertOpen(custody);

    if (dto.userId === custody.custodianId) {
      throw new BadRequestException('The custodian already holds this volume');
    }
    const ownerId = ctx.employment?.employerId ?? ctx.effectiveOwnerId;
    if (dto.userId !== ownerId) {
      await this.requireEmploymentInBusiness(ownerId, dto.userId, custody.shopId);
    }

    const existing = await this.teamRepo.findOne({
      where: { custodyId: custody.id, userId: dto.userId, removedAt: IsNull() },
    });
    if (existing) return existing;

    const member = this.teamRepo.create({
      orgId: custody.orgId,
      shopId: custody.shopId,
      custodyId: custody.id,
      userId: dto.userId,
      addedById: ctx.actorId,
    });
    return this.teamRepo.save(member);
  }

  /**
   * Removal stamps `removed_at`; the row stays. Who was on the team during a
   * period that has already been settled is part of that period's record.
   */
  async removeTeamMember(ctx: ActorContext, memberId: string): Promise<void> {
    const member = await this.teamRepo.findOne({ where: { id: memberId, ...readScope(ctx) } });
    if (!member) throw new NotFoundException('Team member not found');
    await this.custodyWritableBy(ctx, member.custodyId);
    if (member.removedAt) return;
    member.removedAt = new Date();
    await this.teamRepo.save(member);
  }

  // ─── Attesting to the team's sales ─────────────────────────────────────────

  /** Sales from my volume that I have not yet gone through. */
  async pendingSales(ctx: ActorContext): Promise<SaleTransaction[]> {
    const custody = await this.custodyRepo.findOne({
      where: { ...readScope(ctx), custodianId: ctx.actorId, status: StockCustodyStatus.OPEN },
    });
    if (!custody) return [];
    return this.saleRepo.find({
      where: {
        custodyId: custody.id,
        approvalStatus: SaleApprovalStatus.PENDING,
        rejectedAt: IsNull(),
      },
      relations: { actor: true },
      order: { date: 'ASC' },
    });
  }

  /**
   * Attest to a batch. Approval is NOT a ledger gate — the goods left and the
   * money arrived when the sale was recorded, and these rows have counted
   * towards stock and cash ever since (§3.5). What it gates is the handover
   * close: a period with sales nobody has looked at cannot be settled.
   *
   * `expectedCount` is the guard that makes "approve all" honest. The client
   * renders a list and sends back how many lines it showed; if the queue grew
   * between the render and the tap, this refuses rather than sweeping in rows
   * the custodian never saw. Rejecting a bad sale is not done here — it is
   * `POST /sales/:id/reject`, which already restores the stock and keeps the row.
   */
  async approveSales(ctx: ActorContext, dto: ApproveSalesDto): Promise<{ approved: number }> {
    const custody = await this.custodyRepo.findOne({
      where: { ...readScope(ctx), custodianId: ctx.actorId, status: StockCustodyStatus.OPEN },
    });
    if (!custody) throw new ForbiddenException('You are not holding a volume at this branch');

    const sales = await this.saleRepo.find({
      where: {
        id: In(dto.saleIds),
        custodyId: custody.id,
        approvalStatus: SaleApprovalStatus.PENDING,
        rejectedAt: IsNull(),
      },
    });
    if (sales.length !== dto.saleIds.length || sales.length !== dto.expectedCount) {
      throw new ConflictException(
        'This list has changed since you opened it — review it again before approving',
      );
    }

    const now = new Date();
    await this.saleRepo.update(
      { id: In(sales.map((s) => s.id)) },
      { approvalStatus: SaleApprovalStatus.APPROVED, approvedAt: now, approvedById: ctx.actorId },
    );
    return { approved: sales.length };
  }

  // ─── What the sales module asks us ─────────────────────────────────────────

  /**
   * Whose custody-held lots this actor may deduct from.
   *
   * An empty set does NOT mean "everything" — it means this actor may only take
   * unassigned stock. Callers test `custodianId === null || set.has(custodianId)`.
   *
   * The owner is deliberately unbounded: he can sell from any of his branches'
   * volumes, because they are his goods and he carries the loss either way.
   */
  async allowedCustodianIds(ctx: ActorContext): Promise<ReadonlySet<string>> {
    const openHere = await this.custodyRepo.find({
      where: { ...readScope(ctx), status: StockCustodyStatus.OPEN },
    });
    if (openHere.length === 0) return new Set();

    const ownerId = ctx.employment?.employerId ?? ctx.effectiveOwnerId;
    if (ctx.actorId === ownerId) {
      return new Set(openHere.map((c) => c.custodianId));
    }

    const allowed = new Set<string>();
    for (const c of openHere) {
      if (c.custodianId === ctx.actorId) allowed.add(c.custodianId);
    }
    const memberships = await this.teamRepo.find({
      where: {
        custodyId: In(openHere.map((c) => c.id)),
        userId: ctx.actorId,
        removedAt: IsNull(),
      },
    });
    const byId = new Map(openHere.map((c) => [c.id, c]));
    for (const m of memberships) {
      const c = byId.get(m.custodyId);
      if (c) allowed.add(c.custodianId);
    }
    return allowed;
  }

  /**
   * Is this person currently holding a branch's stock for this business?
   *
   * Asked by `EmploymentsService` before it lets an employment end: you cannot
   * walk away — or be walked off — while the goods are in your hands
   * (`SHOP_CUSTODY_PLAN.md` §5.4). Takes ids rather than an `ActorContext`
   * because either party may be the one asking, and the employment names the
   * business already.
   */
  async hasOpenCustody(custodianId: string, orgId: string): Promise<boolean> {
    const count = await this.custodyRepo.count({
      where: { custodianId, orgId, status: StockCustodyStatus.OPEN },
    });
    return count > 0;
  }

  /**
   * The open custody this actor is the custodian of, if any. Null for an owner,
   * for a team member, and for anyone at a branch with no custodian — all of
   * which mean "this action is not coming out of a volume".
   */
  async myOpenCustodyId(ctx: ActorContext): Promise<string | null> {
    const custody = await this.custodyRepo.findOne({
      where: { ...readScope(ctx), custodianId: ctx.actorId, status: StockCustodyStatus.OPEN },
    });
    return custody?.id ?? null;
  }

  /**
   * The custody a consignment was given out of, so goods coming back land where
   * they left from (§3.6). Null for an ordinary consignment off the owner's
   * shelf — which is every one that pre-dates this feature.
   */
  async custodyById(id: string | null): Promise<StockCustody | null> {
    if (!id) return null;
    return this.custodyRepo.findOne({ where: { id } });
  }

  /**
   * Which custody, if any, put the goods a mini is currently holding into their
   * hands. Read from the consignments themselves rather than stored on the mini,
   * because a mini can be supplied by the owner one week and by a custodian the
   * next; the goods remember where they came from, the person does not.
   *
   * Most recent accepted consignment wins when both exist — the practical case
   * is a mini moved onto a custodian's books, not goods split between two.
   */
  async custodyForMini(
    miniId: string,
    orgId: string,
    shopId: string,
  ): Promise<StockCustody | null> {
    const request = await this.consignmentRepo.findOne({
      where: {
        debtorId: miniId,
        supplierOrgId: orgId,
        supplierShopId: shopId,
        custodyId: Not(IsNull()),
        status: ConsignmentStatus.ACCEPTED,
      },
      order: { createdAt: 'DESC' },
    });
    return this.custodyById(request?.custodyId ?? null);
  }

  /**
   * How a new sale off `entry` should be stamped.
   *
   * The owner's own sales are AUTO — he cannot cheat himself, so queuing them
   * for his employee's review would be theatre. The custodian's own sales are
   * AUTO too: they are the one doing the attesting. Everyone else's are PENDING.
   */
  async saleStamp(
    ctx: ActorContext,
    entry: InventoryEntry,
  ): Promise<{ custodyId: string | null; approvalStatus: SaleApprovalStatus }> {
    if (!entry.custodianId) {
      return { custodyId: null, approvalStatus: SaleApprovalStatus.AUTO };
    }
    const custody = await this.custodyRepo.findOne({
      where: {
        orgId: entry.orgId,
        shopId: entry.shopId,
        custodianId: entry.custodianId,
        status: StockCustodyStatus.OPEN,
      },
    });
    if (!custody) {
      return { custodyId: null, approvalStatus: SaleApprovalStatus.AUTO };
    }
    const ownerId = ctx.employment?.employerId ?? ctx.effectiveOwnerId;
    const selfAttesting = ctx.actorId === ownerId || ctx.actorId === custody.custodianId;
    return {
      custodyId: custody.id,
      approvalStatus: selfAttesting ? SaleApprovalStatus.AUTO : SaleApprovalStatus.PENDING,
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private assertOpen(custody: StockCustody): void {
    if (custody.status !== StockCustodyStatus.OPEN) {
      throw new ConflictException('This custody has ended');
    }
  }

  /** A custody on the books this request is scoped to. */
  private async ownedCustody(ctx: ActorContext, id: string): Promise<StockCustody> {
    const custody = await this.custodyRepo.findOne({ where: { id, ...readScope(ctx) } });
    if (!custody) throw new NotFoundException('Custody not found');
    return custody;
  }

  /** Readable by the owner, by the custodian, or by someone on the team. */
  private async custodyReadableBy(ctx: ActorContext, id: string): Promise<StockCustody> {
    const custody = await this.ownedCustody(ctx, id);
    const ownerId = ctx.employment?.employerId ?? ctx.effectiveOwnerId;
    if (ctx.actorId === ownerId || ctx.actorId === custody.custodianId) return custody;

    const member = await this.teamRepo.findOne({
      where: { custodyId: custody.id, userId: ctx.actorId, removedAt: IsNull() },
    });
    if (!member) throw new ForbiddenException('This volume is not yours');
    return custody;
  }

  /** Writable by the owner or the custodian; a team member may only read. */
  private async custodyWritableBy(ctx: ActorContext, id: string): Promise<StockCustody> {
    const custody = await this.ownedCustody(ctx, id);
    const ownerId = ctx.employment?.employerId ?? ctx.effectiveOwnerId;
    if (ctx.actorId === ownerId || ctx.actorId === custody.custodianId) return custody;
    throw new ForbiddenException('This volume is not yours');
  }

  private async issueForCustodian(ctx: ActorContext, issueId: string): Promise<StockIssue> {
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, ...readScope(ctx) },
      relations: { items: true, custody: true },
    });
    if (!issue) throw new NotFoundException('Volume not found');
    if (issue.custody.custodianId !== ctx.actorId) {
      throw new ForbiddenException('This volume was not offered to you');
    }
    return issue;
  }

  /**
   * Unassigned lots to draw an issue line from, SUPPLIER before PERSONAL
   * (business rule 2), oldest first. Locked for update so two accepts cannot
   * both take the last carton.
   */
  private async unassignedLots(
    manager: EntityManager,
    custody: StockCustody,
    item: StockIssueItem,
  ): Promise<InventoryEntry[]> {
    if (item.sourceEntryId) {
      const lot = await manager.findOne(InventoryEntry, {
        where: { id: item.sourceEntryId, custodianId: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      return lot && lot.orgId === custody.orgId && lot.shopId === custody.shopId ? [lot] : [];
    }

    const match = item.variantId
      ? { variantId: item.variantId }
      : { productName: ILike(item.productName), variantId: IsNull() };

    const lots = await manager.find(InventoryEntry, {
      where: SHELF_SOURCES.map((source) => ({
        orgId: custody.orgId,
        shopId: custody.shopId,
        custodianId: IsNull(),
        quantityRemaining: Not(0),
        source,
        ...match,
      })),
      order: { createdAt: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    return [
      ...lots.filter((e) => e.source === InventorySource.SUPPLIER),
      ...lots.filter((e) => e.source === InventorySource.PERSONAL),
    ].filter((e) => e.quantityRemaining > 0);
  }

  private async requireFullEmploymentAtShop(
    ctx: ActorContext,
    employeeId: string,
    shopId: string,
  ): Promise<Employment> {
    const ownerId = ctx.effectiveOwnerId;
    const employment = await this.employmentRepo.findOne({
      // tenancy-exempt: an employment is a relationship between two PEOPLE; the
      // branch is checked explicitly on the line below.
      where: { employerId: ownerId, employeeId, status: EmploymentStatus.ACTIVE },
    });
    if (!employment) throw new NotFoundException('This person does not work for you');
    if (employment.tier !== EmploymentTier.FULL) {
      throw new BadRequestException('Only a full employee can be put in charge of a branch');
    }
    if (employment.shopId !== shopId) {
      throw new BadRequestException('This employee is assigned to a different branch');
    }
    return employment;
  }

  private async requireEmploymentInBusiness(
    ownerId: string,
    userId: string,
    shopId: string,
  ): Promise<Employment> {
    const employment = await this.employmentRepo.findOne({
      // tenancy-exempt: see requireFullEmploymentAtShop.
      where: { employerId: ownerId, employeeId: userId, status: EmploymentStatus.ACTIVE },
    });
    if (!employment) throw new NotFoundException('This person does not work for you');
    if (employment.shopId !== shopId) {
      throw new BadRequestException('This employee is assigned to a different branch');
    }
    return employment;
  }
}
