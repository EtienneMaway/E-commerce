import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Shop } from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';

/**
 * Every table that carries a `shop_id`. Used only to answer "does this branch
 * still hold anything?" before a hard delete.
 */
const SCOPED_TABLES = [
  'inventory_entries',
  'stock_movements',
  'product_groups',
  'product_variants',
  'product_prices',
  'quantity_discounts',
  'sale_transactions',
  'expenses',
  'withdrawals',
  'external_transactions',
  'supplier_debts',
  'debtor_credits',
  'external_contacts',
  'mini_expenses',
  'mini_settlements',
  'mini_team_members',
  'payments',
  'employments',
  'salary_payments',
] as const;

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shops: Repository<Shop>,
  ) {}

  /**
   * The branches this caller may see.
   *
   * An employee gets exactly the one they are assigned to — not a filtered view
   * of the others, which would tell them how many branches the business has.
   */
  async list(ctx: ActorContext): Promise<Shop[]> {
    if (ctx.tier !== 'OWNER') {
      const shop = ctx.shopId
        ? await this.shops.findOne({ where: { id: ctx.shopId, orgId: ctx.orgId } })
        : null;
      return shop ? [shop] : [];
    }
    return this.shops.find({
      where: { orgId: ctx.orgId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  async findOne(ctx: ActorContext, id: string): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { id, orgId: ctx.orgId } });
    // 404 rather than 403 for a shop in another organization — a 403 would
    // confirm the id exists.
    if (!shop) throw new NotFoundException('Branch not found');
    return shop;
  }

  async create(ctx: ActorContext, dto: CreateShopDto): Promise<Shop> {
    const name = dto.name.trim();
    const clash = await this.shops.findOne({ where: { orgId: ctx.orgId, name } });
    if (clash) throw new ConflictException('A branch with this name already exists');

    return this.shops.save(
      this.shops.create({
        orgId: ctx.orgId,
        name,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        city: dto.city ?? null,
        note: dto.note ?? null,
        receiptHeader: dto.receiptHeader ?? null,
        receiptFooter: dto.receiptFooter ?? null,
        // The first shop of an organization is created by the seed or by
        // registration, so a shop created here is never the default.
        isDefault: false,
      }),
    );
  }

  async update(ctx: ActorContext, id: string, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.findOne(ctx, id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const clash = await this.shops.findOne({
        where: { orgId: ctx.orgId, name, id: Not(id) },
      });
      if (clash) throw new ConflictException('A branch with this name already exists');
      shop.name = name;
    }
    if (dto.address !== undefined) shop.address = dto.address;
    if (dto.phone !== undefined) shop.phone = dto.phone;
    if (dto.city !== undefined) shop.city = dto.city;
    if (dto.note !== undefined) shop.note = dto.note;
    if (dto.receiptHeader !== undefined) shop.receiptHeader = dto.receiptHeader;
    if (dto.receiptFooter !== undefined) shop.receiptFooter = dto.receiptFooter;

    return this.shops.save(shop);
  }

  /**
   * Move the default flag.
   *
   * Not in the original plan, and required by it: a request with no `X-Shop-Id`
   * resolves to the default shop, and an archived shop refuses writes — so
   * without a way to move the flag, a merchant who outgrows their first branch
   * could never close it.
   */
  async setDefault(ctx: ActorContext, id: string): Promise<Shop> {
    const shop = await this.findOne(ctx, id);
    if (shop.archivedAt) {
      throw new ConflictException('Reopen this branch before making it the default');
    }

    // The partial unique index allows exactly one default per organization, so
    // the old one must be cleared in the same transaction as the new one is set.
    return this.shops.manager.transaction(async (manager) => {
      await manager.update(Shop, { orgId: ctx.orgId, isDefault: true }, { isDefault: false });
      shop.isDefault = true;
      return manager.save(Shop, shop);
    });
  }

  /**
   * Close a branch: readable forever, writable never (§3.1). The write refusal
   * itself lives in `JwtAuthGuard`, which sees every request.
   */
  async archive(ctx: ActorContext, id: string): Promise<Shop> {
    const shop = await this.findOne(ctx, id);
    if (shop.archivedAt) return shop;

    if (shop.isDefault) {
      // Archiving the default would leave every headerless request — every
      // older mobile install — pointed at a branch that refuses writes.
      throw new ConflictException(
        'Make another branch the default before closing this one',
      );
    }

    const openEmployments = await this.shops.manager.query<{ n: string }[]>(
      `SELECT count(*)::int AS n FROM "employments"
        WHERE "shop_id" = $1 AND "status" IN ('PENDING', 'ACTIVE', 'TERMINATION_REQUESTED')`,
      [id],
    );
    if (Number(openEmployments[0]?.n ?? 0) > 0) {
      throw new ConflictException(
        'Move or release the employees at this branch before closing it',
      );
    }

    shop.archivedAt = new Date();
    return this.shops.save(shop);
  }

  async unarchive(ctx: ActorContext, id: string): Promise<Shop> {
    const shop = await this.findOne(ctx, id);
    shop.archivedAt = null;
    return this.shops.save(shop);
  }

  /**
   * Hard delete, for a branch created by mistake five minutes ago.
   *
   * Archive is the real path. A branch that has traded owns history that must
   * outlive it, so this refuses the moment any scoped table holds a row.
   */
  async remove(ctx: ActorContext, id: string): Promise<void> {
    const shop = await this.findOne(ctx, id);
    if (shop.isDefault) {
      throw new BadRequestException('The default branch cannot be deleted');
    }

    // Each arm is PARENTHESISED. Postgres refuses `LIMIT` inside a bare UNION
    // arm ("syntax error at or near UNION"), so the unparenthesised version of
    // this query made every delete a 500 — including the empty branch this
    // endpoint exists to remove. The mocked-repo spec could not see it: it
    // stubs `manager.query`, so the SQL string was never parsed by a database.
    const union = SCOPED_TABLES.map(
      (t) => `(SELECT 1 FROM "${t}" WHERE "shop_id" = $1 LIMIT 1)`,
    ).join(' UNION ALL ');
    const held = await this.shops.manager.query<unknown[]>(
      `SELECT 1 AS held WHERE EXISTS (${union}) LIMIT 1`,
      [id],
    );
    if (held.length > 0) {
      throw new ConflictException(
        'This branch has records — close it instead of deleting it',
      );
    }

    await this.shops.delete({ id, orgId: ctx.orgId });
  }

  /** Unarchived shops of an organization — what a switcher should offer. */
  async listActive(orgId: string): Promise<Shop[]> {
    return this.shops.find({
      where: { orgId, archivedAt: IsNull() },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }
}
