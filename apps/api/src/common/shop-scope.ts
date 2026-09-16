import { BadRequestException } from '@nestjs/common';
import { In, type FindOperator, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { ActorContext } from './types/actor-context';

/**
 * The two filter shapes, and nothing else (MULTI_SHOP_PLAN.md §3.10):
 *
 *   one branch    org_id = :orgId AND shop_id = :shopId
 *   all branches  org_id = :orgId
 *
 * Deliberately mirrors `common/actor-filter.ts` — reviewers already know that
 * shape, and the two get used side by side.
 */

/** Header the clients send to choose a branch. `all` means every branch. */
export const SHOP_HEADER = 'x-shop-id';

/**
 * Header for choosing the business, when someone owns more than one.
 *
 * Rare but real: every account is seeded an organization, so anyone who accepts
 * a transferred business owns two (§3.14). Without this the guard picks one by
 * arbitrary row order, which is how a merchant ends up looking at the wrong set
 * of books with no way to say so. Absent, the oldest organization wins — the one
 * they registered with.
 */
export const ORG_HEADER = 'x-org-id';

/** Value of `X-Shop-Id` meaning "every branch in this organization". */
export const SHOP_SCOPE_ALL = 'all';

/**
 * The shop a write must land in.
 *
 * Throws rather than returning null so services can treat `ctx.shopId` as
 * present on every write path. In practice the guard has already refused any
 * non-GET request under `shopScope: 'all'`, so this is the second line of
 * defence — and the one that gives TypeScript a non-null string.
 */
export function requireShop(ctx: ActorContext): string {
  if (!ctx.shopId) {
    throw new BadRequestException('Select a shop for this action');
  }
  return ctx.shopId;
}

/**
 * Where-clause value for a read: one shop, or every shop in the organization.
 *
 * Under `all` this returns `undefined` — the caller omits `shopId` from the
 * where object and filters on `orgId` alone, which is exact by construction.
 * `In([...visibleShopIds])` was the alternative and is rejected on purpose: an
 * array assembled per request under-reports the moment a branch is created
 * mid-session, and an under-reported rollup looks like a plausible number
 * rather than an error.
 */
export function shopWhereValue(ctx: ActorContext): string | undefined {
  return ctx.shopId ?? undefined;
}

/**
 * Apply the tenancy filter to a QueryBuilder.
 *
 * Pass the aliased columns, e.g.
 * `applyShopScopeToQb(qb, 'sale.org_id', 'sale.shop_id', ctx)`.
 */
export function applyShopScopeToQb<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  orgColumn: string,
  shopColumn: string,
  ctx: ActorContext,
  paramPrefix = 'shopScope',
): void {
  qb.andWhere(`${orgColumn} = :${paramPrefix}Org`, { [`${paramPrefix}Org`]: ctx.orgId });
  if (ctx.shopId) {
    qb.andWhere(`${shopColumn} = :${paramPrefix}Shop`, { [`${paramPrefix}Shop`]: ctx.shopId });
  }
}

/**
 * Escape hatch for the rare read that genuinely wants a named set of shops
 * (a comparison chart, say) rather than one or all. Not for tenancy.
 */
export function inShops(shopIds: readonly string[]): FindOperator<string> {
  return In([...shopIds]);
}

/**
 * Tenancy for a **read**, as a find-where fragment.
 *
 * Spread it into a `where` object:
 *
 * ```ts
 * this.repo.find({ where: { ...readScope(ctx), productName } })
 * ```
 *
 * Under `all` it omits `shopId` entirely and filters on `orgId` alone, which is
 * exact by construction — see §3.10 on why an assembled shop-id array is not.
 */
export function readScope(ctx: ActorContext): { orgId: string; shopId?: string } {
  return ctx.shopId ? { orgId: ctx.orgId, shopId: ctx.shopId } : { orgId: ctx.orgId };
}

/**
 * Tenancy **and holder** for a read on a table whose rows are held by a person:
 * `inventory_entries`, `sale_transactions`, `stock_movements`, `supplier_debts`,
 * `debtor_credits`.
 *
 * Branch scope alone is not enough on those five. A mini's consigned lot, their
 * sales and their debt to the employer sit at the employer's branch (same
 * `org_id`, same `shop_id`) while the mini holds them (`owner_id` = the mini).
 * Filtered by branch only, the owner's product list counted the mini's goods as
 * sellable, an owner sale deducted a lot that was physically with the mini, and
 * the mini could sell the owner's shelf. `owner_id` was kept on exactly these
 * tables for this reason — this is the filter that uses it.
 *
 * Use it wherever the read is about **the caller's own books**. A read about a
 * named person's books (a mini's handover, by `miniId`) keeps its explicit
 * `ownerId` and a `tenancy-exempt:` marker instead.
 */
export function holderScope(
  ctx: ActorContext,
): { orgId: string; shopId?: string; ownerId: string } {
  return { ...readScope(ctx), ownerId: ctx.effectiveOwnerId };
}

/**
 * `holderScope` for a QueryBuilder, as a `[condition, params]` pair to spread
 * into `.where(...)` or `.andWhere(...)`:
 *
 * ```ts
 * this.saleRepo.createQueryBuilder('s').select(...).where(...holderCond('s', ctx))
 * ```
 *
 * A pair rather than a `qb => void` helper because most of these queries are a
 * single chained expression inside `Promise.all`, with nowhere to call one.
 * Parameter names are prefixed with the alias so two holder conditions can sit
 * in one query.
 */
export function holderCond(
  alias: string,
  ctx: ActorContext,
): [string, Record<string, string>] {
  const p = `${alias}Holder`;
  const shop = ctx.shopId ? ` AND ${alias}.shopId = :${p}Shop` : '';
  return [
    `${alias}.orgId = :${p}Org${shop} AND ${alias}.ownerId = :${p}Owner`,
    {
      [`${p}Org`]: ctx.orgId,
      ...(ctx.shopId ? { [`${p}Shop`]: ctx.shopId } : {}),
      [`${p}Owner`]: ctx.effectiveOwnerId,
    },
  ];
}

/**
 * `holderCond` for an UPDATE builder, which addresses raw columns rather than an
 * alias: `manager.createQueryBuilder().update(Entity).where(...holderColumnsCond(ctx))`.
 */
export function holderColumnsCond(ctx: ActorContext): [string, Record<string, string>] {
  const shopId = requireShop(ctx);
  return [
    'org_id = :holderColOrg AND shop_id = :holderColShop AND owner_id = :holderColOwner',
    { holderColOrg: ctx.orgId, holderColShop: shopId, holderColOwner: ctx.effectiveOwnerId },
  ];
}

/**
 * Whether a row loaded by id sits on the caller's own books: same business, the
 * selected branch (any, under "All branches"), and held by the caller. The id
 * lookup equivalent of `holderScope` — without the holder half, an owner could
 * re-price, adjust or reject a mini's lot or sale at their own branch.
 */
export function isOnMyBooks(
  row: { orgId: string; shopId: string; ownerId: string },
  ctx: ActorContext,
): boolean {
  return (
    row.orgId === ctx.orgId &&
    (!ctx.shopId || row.shopId === ctx.shopId) &&
    row.ownerId === ctx.effectiveOwnerId
  );
}

/**
 * Tenancy for a **write**, as columns to persist.
 *
 * Throws if no single shop is selected, which the guard has already refused for
 * any non-GET — so this is the second line of defence and the one that gives
 * TypeScript a non-null `shopId`.
 */
export function writeScope(ctx: ActorContext): { orgId: string; shopId: string } {
  return { orgId: ctx.orgId, shopId: requireShop(ctx) };
}
