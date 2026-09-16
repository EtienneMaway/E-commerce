import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Employment, Organization, OrganizationOwnershipHistory, Shop } from '../entities';

interface OrgSummary {
  id: string;
  name: string;
  taxId: string | null;
  logoUrl: string | null;
  isOwner: boolean;
}

/** Name every account's first branch carries until the merchant renames it. */
export const DEFAULT_SHOP_NAME = 'Main Shop';

/** What the guard needs to build the tenancy half of an ActorContext. */
export interface OwnerShops {
  readonly orgId: string;
  readonly defaultShopId: string;
  /** Unarchived shops, for the switcher. */
  readonly visibleShopIds: readonly string[];
  readonly archivedShopIds: readonly string[];
}

/**
 * Resolves which business and which branch a request belongs to.
 *
 * Lives in `shops/` from Phase 2 so the guard has something to call; Phase 3
 * adds the controller beside it.
 */
@Injectable()
export class ShopContextService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(Shop)
    private readonly shops: Repository<Shop>,
  ) {}

  /**
   * The organization a user administers, with its shops.
   *
   * Every account is seeded one organization and one default shop by migration
   * 032, and registration creates them in the same transaction from Phase 3 —
   * so this is total, and a miss is a real error rather than a case to handle.
   */
  async forOwner(userId: string, requestedOrgId?: string): Promise<OwnerShops> {
    // Ordered, not `findOne`: someone who accepts a transferred business owns
    // two organizations, and an unordered pick would silently show them the
    // wrong books. Oldest first — the one they registered with.
    const owned = await this.organizations.find({
      where: { ownerUserId: userId },
      select: { id: true },
      order: { createdAt: 'ASC' },
    });
    const org = requestedOrgId
      ? owned.find((o) => o.id === requestedOrgId)
      : owned[0];

    if (!org && requestedOrgId) {
      // 404 rather than 403, for the same reason a foreign shop id is: a 403
      // would confirm that another merchant's business exists.
      throw new NotFoundException('Business not found');
    }
    if (!org) {
      // Only reachable if the seed missed a user — which migration 032 asserts
      // against. Loud beats a silently empty set of books.
      throw new NotFoundException('No business found for this account');
    }

    const shops = await this.shops.find({
      where: { orgId: org.id },
      select: { id: true, isDefault: true, archivedAt: true },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });

    const active = shops.filter((s) => s.archivedAt === null);
    const fallback = active[0] ?? shops[0];
    const defaultShop = shops.find((s) => s.isDefault) ?? fallback;

    return {
      orgId: org.id,
      defaultShopId: defaultShop.id,
      visibleShopIds: active.map((s) => s.id),
      archivedShopIds: shops.filter((s) => s.archivedAt !== null).map((s) => s.id),
    };
  }

  /**
   * A shop by id, but only within `orgId`.
   *
   * Returns null rather than throwing so the caller decides the status code —
   * the guard answers `404` for a shop in someone else's organization, because
   * a `403` would confirm that another merchant's shop id exists.
   */
  async findInOrg(shopId: string, orgId: string): Promise<Shop | null> {
    return this.shops.findOne({ where: { id: shopId, orgId } });
  }

  /** The default shop of an organization — used when an employee has no shop set. */
  async defaultShopId(orgId: string): Promise<string | null> {
    const shop = await this.shops.findOne({
      where: { orgId, isDefault: true, archivedAt: IsNull() },
      select: { id: true },
    });
    return shop?.id ?? null;
  }

  /**
   * Give a user their organization and default shop, if they have none.
   *
   * Migration 032 seeded every account that existed when it ran; this is the
   * same guarantee for every account created afterwards. It must hold for
   * **every** user, not just merchants who register: an employer-created mini
   * whose employment is later terminated becomes an OWNER with no employment,
   * and without an organization of their own every request — including the
   * always-on core that lets them read their salary and quit — would 404.
   *
   * Idempotent, and safe to call inside a caller's transaction by passing its
   * manager.
   */
  async ensureForUser(
    userId: string,
    /** Falls back to a generic name — never trusted to be present. */
    businessName: string | null | undefined,
    shopName: string = DEFAULT_SHOP_NAME,
    manager?: EntityManager,
  ): Promise<{ orgId: string; shopId: string }> {
    const orgRepo = manager ? manager.getRepository(Organization) : this.organizations;
    const shopRepo = manager ? manager.getRepository(Shop) : this.shops;

    const existing = await orgRepo.findOne({ where: { ownerUserId: userId } });
    if (existing) {
      const shop =
        (await shopRepo.findOne({ where: { orgId: existing.id, isDefault: true } })) ??
        (await shopRepo.save(
          shopRepo.create({ orgId: existing.id, name: shopName, isDefault: true }),
        ));
      return { orgId: existing.id, shopId: shop.id };
    }

    const org = await orgRepo.save(
      orgRepo.create({ ownerUserId: userId, name: businessName?.trim() || 'My Business' }),
    );
    const shop = await shopRepo.save(
      shopRepo.create({ orgId: org.id, name: shopName, isDefault: true }),
    );

    // The founding row of the succession record (§3.12): `actor_id` tells you
    // who did a thing, never who was responsible for the business when they
    // did it.
    const historyRepo = manager
      ? manager.getRepository(OrganizationOwnershipHistory)
      : this.organizations.manager.getRepository(OrganizationOwnershipHistory);
    await historyRepo.save(
      historyRepo.create({ orgId: org.id, fromUserId: null, toUserId: userId }),
    );

    return { orgId: org.id, shopId: shop.id };
  }


  /**
   * The tenancy block returned by `/auth/me`, so a client can paint its shop
   * switcher on first load rather than after a second round trip.
   *
   * An employee sees the employer's business and exactly their own branch —
   * never the list of the others, which would tell them how many branches the
   * business has.
   */
  async summaryFor(
    userId: string,
    employment: Employment | null,
  ): Promise<{
    organization: OrgSummary | null;
    organizations: OrgSummary[];
    shops: {
      id: string;
      name: string;
      address: string | null;
      isDefault: boolean;
      isArchived: boolean;
    }[];
    defaultShopId: string | null;
  }> {
    const toSummary = (shop: Shop) => ({
      id: shop.id,
      name: shop.name,
      address: shop.address,
      isDefault: shop.isDefault,
      isArchived: shop.archivedAt != null,
    });

    if (employment) {
      const orgId = employment.orgId ?? (await this.orgIdOfOwner(employment.employerId));
      if (!orgId) return { organization: null, organizations: [], shops: [], defaultShopId: null };

      const org = await this.organizations.findOne({ where: { id: orgId } });
      const shopId = employment.shopId ?? (await this.defaultShopId(orgId));
      const shop = shopId ? await this.findInOrg(shopId, orgId) : null;

      const summary = org
        ? { id: org.id, name: org.name, taxId: org.taxId, logoUrl: org.logoUrl, isOwner: false }
        : null;
      return {
        organization: summary,
        // An employee never sees a business switcher: they work for one.
        organizations: summary ? [summary] : [],
        shops: shop ? [toSummary(shop)] : [],
        defaultShopId: shop?.id ?? null,
      };
    }

    const owned = await this.organizations.find({
      where: { ownerUserId: userId },
      order: { createdAt: 'ASC' },
    });
    const org = owned[0];
    if (!org) return { organization: null, organizations: [], shops: [], defaultShopId: null };

    const shops = await this.shops.find({
      where: { orgId: org.id },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });

    return {
      organization: {
        id: org.id,
        name: org.name,
        taxId: org.taxId,
        logoUrl: org.logoUrl,
        isOwner: true,
      },
      // More than one only after accepting a transferred business (§3.14). The
      // dashboard shows a business switcher above the branch switcher when this
      // has two entries, and nothing at all when it has one.
      organizations: owned.map((o) => ({
        id: o.id,
        name: o.name,
        taxId: o.taxId,
        logoUrl: o.logoUrl,
        isOwner: true,
      })),
      shops: shops.map(toSummary),
      defaultShopId: shops.find((s) => s.isDefault)?.id ?? shops[0]?.id ?? null,
    };
  }

  /**
   * Where a counterparty trades from, when we have no better information.
   *
   * A debt or credit records the other side's branch (migration 033). Sometimes
   * that branch is known exactly — a consignment names both — and sometimes it
   * is not: receiving stock from a supplier says which *person* supplied it, not
   * which of their branches shipped it. Their default branch is the honest
   * answer there, and it is exactly right for the single-branch suppliers that
   * are almost all of them.
   *
   * Returns nulls for a counterparty with no organization (an external contact
   * that is not a real account), which the nullable columns are there to hold.
   */
  async defaultTenancyOf(
    userId: string,
  ): Promise<{ counterpartyOrgId: string | null; counterpartyShopId: string | null }> {
    const org = await this.organizations.findOne({
      where: { ownerUserId: userId },
      select: { id: true },
      order: { createdAt: 'ASC' },
    });
    if (!org) return { counterpartyOrgId: null, counterpartyShopId: null };

    const shop = await this.shops.findOne({
      where: { orgId: org.id, isDefault: true },
      select: { id: true },
    });
    return { counterpartyOrgId: org.id, counterpartyShopId: shop?.id ?? null };
  }

  /** The organization a given user administers, or null. */
  async orgIdOfOwner(userId: string): Promise<string | null> {
    const org = await this.organizations.findOne({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    return org?.id ?? null;
  }
}
