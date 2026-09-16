import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import {
  Employment,
  EmploymentStatus,
  Organization,
  OrganizationOwnershipHistory,
  User,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { ShopContextService } from './shop-context.service';

/** Employment states that still bind someone to a business. */
const OPEN_EMPLOYMENT = [
  EmploymentStatus.PENDING,
  EmploymentStatus.ACTIVE,
  EmploymentStatus.TERMINATION_REQUESTED,
];

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Employment)
    private readonly employments: Repository<Employment>,
    private readonly shopContext: ShopContextService,
  ) {}

  async findMine(ctx: ActorContext): Promise<Organization> {
    const org = await this.organizations.findOne({ where: { id: ctx.orgId } });
    if (!org) throw new NotFoundException('No business found for this account');
    return org;
  }

  async update(ctx: ActorContext, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findMine(ctx);
    if (dto.name !== undefined) org.name = dto.name.trim();
    if (dto.taxId !== undefined) org.taxId = dto.taxId;
    if (dto.logoUrl !== undefined) org.logoUrl = dto.logoUrl;
    return this.organizations.save(org);
  }

  // ─── Ownership transfer (§3.12) ───────────────────────────────────────────

  /**
   * Offer the business to someone. Propose-then-accept, exactly like an
   * employment invite: an organization carries supplier debts, payroll and a
   * subscription, so handing it over without consent hands over liabilities.
   */
  async proposeTransfer(ctx: ActorContext, dto: TransferOwnershipDto): Promise<Organization> {
    const org = await this.findMine(ctx);
    if (org.ownerUserId !== ctx.actorId) {
      throw new ConflictException('Only the owner can transfer this business');
    }
    if (dto.newOwnerUserId === ctx.actorId) {
      throw new BadRequestException('You already own this business');
    }

    await this.assertEligibleNominee(dto.newOwnerUserId);

    org.pendingOwnerUserId = dto.newOwnerUserId;
    return this.organizations.save(org);
  }

  async cancelTransfer(ctx: ActorContext): Promise<Organization> {
    const org = await this.findMine(ctx);
    if (org.ownerUserId !== ctx.actorId) {
      throw new ConflictException('Only the owner can cancel this transfer');
    }
    org.pendingOwnerUserId = null;
    return this.organizations.save(org);
  }

  /** Every organization currently offered to this user. */
  async listOffersTo(userId: string): Promise<Organization[]> {
    return this.organizations.find({ where: { pendingOwnerUserId: userId } });
  }

  async rejectTransfer(userId: string, orgId: string): Promise<void> {
    const org = await this.organizations.findOne({ where: { id: orgId } });
    if (!org || org.pendingOwnerUserId !== userId) {
      throw new NotFoundException('No pending transfer for this business');
    }
    org.pendingOwnerUserId = null;
    await this.organizations.save(org);
  }

  /**
   * Accept the business.
   *
   * Preconditions are re-checked here, not just at propose: days pass in
   * between and the nominee's account can change in any of them.
   */
  async acceptTransfer(userId: string, orgId: string): Promise<Organization> {
    const org = await this.organizations.findOne({ where: { id: orgId } });
    if (!org || org.pendingOwnerUserId !== userId) {
      throw new NotFoundException('No pending transfer for this business');
    }
    await this.assertEligibleNominee(userId);

    const previousOwnerId = org.ownerUserId;

    const result = await this.organizations.manager.transaction(async (manager) => {
      org.ownerUserId = userId;
      org.pendingOwnerUserId = null;
      const saved = await manager.save(Organization, org);

      // The common case is promoting your own manager. Left in place, their
      // employment would make JwtAuthGuard resolve them as FULL_EMPLOYEE and
      // quietly restrict the new owner on their own books.
      await manager.update(
        Employment,
        { employerId: previousOwnerId, employeeId: userId, status: In(OPEN_EMPLOYMENT) },
        { status: EmploymentStatus.TERMINATED, terminatedAt: new Date() },
      );

      // Order matters: pinning reads `owner_id = previous owner`, which the
      // re-home below then moves.
      await this.pinPreviousOwnerAsActor(manager, org.id, previousOwnerId);
      await this.rehomeBusiness(manager, org.id, previousOwnerId, userId);

      // The one fact that cannot be reconstructed afterwards: actor_id says who
      // did a thing, never who was responsible for the business at the time.
      await manager.save(
        OrganizationOwnershipHistory,
        manager.create(OrganizationOwnershipHistory, {
          orgId: org.id,
          fromUserId: previousOwnerId,
          toUserId: userId,
        }),
      );

      return saved;
    });

    // The previous owner may now administer nothing at all — transferring the
    // business they registered with leaves them with zero organizations, and
    // the guard resolves an owner through exactly that row. Without this they
    // would 404 out of their own account: no profile, no salary, no way to be
    // hired somewhere else. Give them the same empty business every new account
    // starts with (§3.14: there is no such thing as a user without a shop).
    const stillOwns = await this.organizations.count({
      where: { ownerUserId: previousOwnerId },
    });
    if (stillOwns === 0) {
      const previous = await this.users.findOne({ where: { id: previousOwnerId } });
      if (previous) {
        await this.shopContext.ensureForUser(
          previousOwnerId,
          previous.name ?? previous.username,
        );
      }
    }

    return result;
  }

  /**
   * Keep the previous owner's history attributed to them.
   *
   * Every write stores `actor_id = NULL` when the actor is the owner of the
   * books ("Self"). That reading is only true while the books keep their owner:
   * after a hand-over, the new owner's screens would show every sale the founder
   * made as their own. So the NULLs that meant "the previous owner" are written
   * out as the previous owner's id, in the same transaction as the hand-over.
   *
   * Scoped with care, because NULL does not always mean the business owner:
   * - `sale_transactions`, `inventory_entries` — a mini's own sales and lots
   *   also store NULL (the mini is the owner of *their* books, which sit in the
   *   employer's organization). Those tables keep `owner_id` as the holder, so
   *   only rows the previous owner held are touched.
   * - `expenses`, `payments`, `external_transactions` — no mini route writes
   *   them (`@AllowedFor` has no MINI_EMPLOYEE), so every NULL is the owner.
   * - `mini_settlements` is left alone: a NULL there can be the mini submitting
   *   or the owner approving, and nothing on the row tells them apart.
   */
  private async pinPreviousOwnerAsActor(
    manager: EntityManager,
    orgId: string,
    previousOwnerId: string,
  ): Promise<void> {
    for (const table of ['expenses', 'payments', 'external_transactions']) {
      await manager.query(
        `UPDATE "${table}" SET "actor_id" = $1 WHERE "org_id" = $2 AND "actor_id" IS NULL`,
        [previousOwnerId, orgId],
      );
    }
    for (const table of ['sale_transactions', 'inventory_entries']) {
      await manager.query(
        `UPDATE "${table}" SET "actor_id" = $1
          WHERE "org_id" = $2 AND "owner_id" = $1 AND "actor_id" IS NULL`,
        [previousOwnerId, orgId],
      );
    }
  }

  /**
   * Hand the business's books to the new owner.
   *
   * §3.12 once said a transfer was "one column", because `owner_id` was to be
   * dropped everywhere. It was kept on five tables as the *holder* of rows
   * (§3.2 amended), and a handful of person-keys mean "the owner of this
   * business" rather than "whoever did it". Left pointing at the previous owner,
   * the new owner reads empty stock and sales, full employees keep acting for
   * the previous owner (their `effectiveOwnerId` is `employments.employer_id`),
   * a mini's handover cannot find their debt, and received payments drop out of
   * the cash position.
   *
   * What moves (previous owner → new owner):
   * - the holder `owner_id` on inventory, sales, movements, debts and credits,
   *   for rows this business held — never a mini's (their `owner_id` is them);
   * - `employer_id` on employments and salary payments — staff and payroll are
   *   the business's (§3.12: the nominee takes on payroll);
   * - the business as supplier (minis' debts, lots and sales name it) and as
   *   debtor, including other businesses' rows paired to it by
   *   `counterparty_org_id`;
   * - consignments sent from or addressed to the business;
   * - payments the business sent or received.
   *
   * What does not: `actor_id`/`rejected_by_id` — who did a thing is history
   * (pinned just before this runs) — and the previous owner's dealings under any
   * other business.
   *
   * A counterparty debt or credit that would collide with one the new owner
   * already has with that business is left in place rather than failing the
   * whole hand-over; that is only possible when the two already trade directly.
   */
  private async rehomeBusiness(
    manager: EntityManager,
    orgId: string,
    previousOwnerId: string,
    newOwnerId: string,
  ): Promise<void> {
    const params = [previousOwnerId, newOwnerId, orgId];
    const run = (sql: string): Promise<unknown> => manager.query(sql, params);

    // Rows the business held.
    for (const table of ['inventory_entries', 'sale_transactions', 'stock_movements', 'supplier_debts', 'debtor_credits']) {
      await run(`UPDATE "${table}" SET "owner_id" = $2 WHERE "org_id" = $3 AND "owner_id" = $1`);
    }

    // Staff and payroll.
    await run(`UPDATE "employments" SET "employer_id" = $2 WHERE "org_id" = $3 AND "employer_id" = $1`);
    await run(`UPDATE "salary_payments" SET "employer_id" = $2 WHERE "org_id" = $3 AND "employer_id" = $1`);

    // The business as supplier: its minis' side, and other businesses paired to it.
    await run(
      `UPDATE "supplier_debts" t SET "supplier_user_id" = $2
        WHERE t."supplier_user_id" = $1 AND (t."org_id" = $3 OR t."counterparty_org_id" = $3)
          AND NOT EXISTS (SELECT 1 FROM "supplier_debts" d
                           WHERE d."shop_id" = t."shop_id" AND d."owner_id" = t."owner_id"
                             AND d."supplier_user_id" = $2)`,
    );
    await run(`UPDATE "inventory_entries" SET "supplier_user_id" = $2 WHERE "org_id" = $3 AND "supplier_user_id" = $1`);
    await run(`UPDATE "sale_transactions" SET "supplier_user_id" = $2 WHERE "org_id" = $3 AND "supplier_user_id" = $1`);

    // The business as debtor of another business.
    await run(
      `UPDATE "debtor_credits" t SET "debtor_user_id" = $2
        WHERE t."debtor_user_id" = $1 AND t."counterparty_org_id" = $3
          AND NOT EXISTS (SELECT 1 FROM "debtor_credits" d
                           WHERE d."shop_id" = t."shop_id" AND d."owner_id" = t."owner_id"
                             AND d."debtor_user_id" = $2)`,
    );

    // Consignments from or to the business — a pending one must still confirm.
    await run(`UPDATE "consignment_requests" SET "supplier_id" = $2 WHERE "supplier_org_id" = $3 AND "supplier_id" = $1`);
    await run(`UPDATE "consignment_requests" SET "debtor_id" = $2 WHERE "debtor_org_id" = $3 AND "debtor_id" = $1`);

    // Payments the business sent, and payments it received (matched through the
    // credit or debt on the business's side, since a payment row carries the
    // payer's tenancy).
    await run(`UPDATE "payments" SET "paid_by_user_id" = $2 WHERE "org_id" = $3 AND "paid_by_user_id" = $1`);
    await run(
      `UPDATE "payments" p SET "paid_to_user_id" = $2
        WHERE p."paid_to_user_id" = $1
          AND (EXISTS (SELECT 1 FROM "debtor_credits" dc WHERE dc."id" = p."debtor_credit_id" AND dc."org_id" = $3)
            OR EXISTS (SELECT 1 FROM "supplier_debts" sd WHERE sd."id" = p."supplier_debt_id" AND sd."counterparty_org_id" = $3))`,
    );
  }

  async ownershipHistory(ctx: ActorContext): Promise<OrganizationOwnershipHistory[]> {
    return this.organizations.manager.find(OrganizationOwnershipHistory, {
      where: { orgId: ctx.orgId },
      order: { transferredAt: 'ASC' },
    });
  }

  /**
   * A nominee must be a real, reachable account.
   *
   * Note what is deliberately *not* checked: whether they already own an
   * organization. Every account is seeded one, so that condition would make
   * every transfer impossible (§3.14). Owning two businesses is legitimate;
   * "one at a time" binds employment, not ownership.
   */
  private async assertEligibleNominee(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('That account does not exist');
    if (user.deletedAt || user.anonymizedAt) {
      throw new ConflictException('That account is closed');
    }
    if (user.isMiniEmployee || user.isExternalEmployee) {
      throw new ConflictException(
        'An employee profile cannot own a business — they need their own account',
      );
    }
  }

  /**
   * Does this user still run a business that holds records? Used by deletion.
   *
   * `org_id` only. This used to OR in `owner_id` while writes left `org_id`
   * NULL; migration 034 made `org_id` NOT NULL everywhere and dropped
   * `owner_id` from `expenses` and `withdrawals`, so the old clause 500'd every
   * owner's deletion request. Raw SQL, so the compiler never pointed here —
   * only a real request did.
   */
  async ownsOrganizationWithData(userId: string): Promise<boolean> {
    const orgs = await this.organizations.find({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    const ids = orgs.map((o) => o.id);

    const employments = await this.employments.count({
      where: [...(ids.length ? [{ orgId: In(ids) }] : []), { employerId: userId }],
    });
    if (employments > 0) return true;
    if (ids.length === 0) return false;

    const scoped = ['inventory_entries', 'sale_transactions', 'supplier_debts', 'debtor_credits', 'expenses', 'withdrawals'];
    const union = scoped
      .map((t) => `SELECT 1 FROM "${t}" WHERE "org_id" = ANY($1)`)
      .join(' UNION ALL ');

    const rows = await this.organizations.manager.query<unknown[]>(
      `SELECT 1 WHERE EXISTS (${union}) LIMIT 1`,
      [ids],
    );
    return rows.length > 0;
  }
}
