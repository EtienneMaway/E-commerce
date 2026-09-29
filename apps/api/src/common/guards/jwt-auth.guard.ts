import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Employment, EmploymentTier, User } from '../../entities';
import { EmploymentsService } from '../../employments/employments.service';
import { ALLOWED_FOR_KEY } from '../decorators/allowed-for.decorator';
import { REQUIRES_SERVICE_KEY } from '../decorators/requires-service.decorator';
import { ActorContext, ActorTier, ShopScope } from '../types/actor-context';
import { ORG_HEADER, SHOP_HEADER, SHOP_REQUIRED_CODE, SHOP_SCOPE_ALL } from '../shop-scope';
import { ShopContextService } from '../../shops/shop-context.service';
import { ServiceKey, resolveGrantedServices } from '../services/service-catalog';
import { CustodyAccessService } from '../services/custody-access.service';

const DEFAULT_ALLOWED: ActorTier[] = ['OWNER', 'FULL_EMPLOYEE'];

/**
 * Authenticates via JWT (Passport) and, on success:
 *   1. Resolves the request's ActorContext (actor / effectiveOwnerId / tier /
 *      the services granted by the employment's role).
 *   2. Enforces the @AllowedFor tier allowlist (default: OWNER + FULL_EMPLOYEE).
 *   3. Enforces the @RequiresService catalogue gate. Order matters: the tier is
 *      the ceiling and a role can only narrow it, so a service granted above the
 *      tier is still refused at step 2.
 *
 * Combining auth + context + permission in one guard avoids ordering issues with
 * NestJS's lifecycle (interceptors run after guards, so context can't be resolved
 * upstream of a separate permission guard).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly employmentsService: EmploymentsService,
    private readonly shopContext: ShopContextService,
    private readonly custodyAccess: CustodyAccessService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest<{
      user: User;
      method?: string;
      headers: Record<string, string | string[] | undefined>;
      actorContext?: ActorContext;
    }>();
    const user = req.user;

    // X-Acting-As: persona toggle from the dashboard.
    //   'self'     → ignore any active employment, scope to user's own books.
    //   'employer' → apply the active employment (legacy default when employed).
    //   absent     → preserve legacy behaviour for clients that don't yet send
    //                the header (mobile app, curl). Auto-employer when employed.
    const rawHeader = req.headers['x-acting-as'];
    const actingAs = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.toLowerCase();

    // `X-Acting-As: self` lets a FULL employee who also runs their own business
    // ignore the employment and act on their own books as OWNER. A mini-employee
    // is not a standalone owner — they must always resolve to MINI_EMPLOYEE tier
    // (restricted, on their own consigned books), so the 'self' escape hatch is
    // ignored for them to prevent privilege escalation to OWNER.
    //
    // "Mini" covers both legacy synthetic accounts (`isMiniEmployee`) AND any
    // user with an active SALES_ONLY employment (existing users hired as minis,
    // where `isMiniEmployee` is false). Without the SALES_ONLY check a new mini
    // sending `self` would resolve to OWNER and 403 on every mini-only endpoint
    // (handover-preview, my-balance, expenses) even though their sales/stock sit
    // on their own books — surfacing as a spurious "nothing to hand over".
    const activeEmployment = await this.employmentsService.findActiveAsEmployee(
      user.id,
    );
    const isMini =
      user.isMiniEmployee ||
      activeEmployment?.tier === EmploymentTier.SALES_ONLY;
    const employment = actingAs === 'self' && !isMini ? null : activeEmployment;

    const tier: ActorTier = employment
      ? employment.tier === EmploymentTier.SALES_ONLY
        ? 'MINI_EMPLOYEE'
        : 'FULL_EMPLOYEE'
      : 'OWNER';

    const tenancy = await this.resolveTenancy(user.id, employment, req.headers);

    // Being named the current custodian is itself the authorization to reach
    // `custody.hold` routes — the owner chose this specific person and they
    // accepted, the same shape as a mini's mandatory `handovers.mini`. It must
    // not depend on the owner separately remembering to also grant it through a
    // role, or an appointment could strand goods with someone who has no way to
    // reach the accept screen anywhere.
    const isCustodian =
      employment && tier === 'FULL_EMPLOYEE'
        ? await this.custodyAccess.isCurrentCustodian(employment.employeeId, tenancy.shopId)
        : false;
    const services = resolveGrantedServices(
      employment?.role?.services ?? null,
      tier,
      isCustodian ? ['custody.hold'] : [],
    );

    const ctx: ActorContext = employment
      ? {
          actorId: user.id,
          // Mini-employees operate on their OWN books: the employer consigns
          // stock to them (CONSIGNED_IN lands on the mini's books), they sell it
          // and settle by handover. Full employees operate on the employer's books.
          effectiveOwnerId: tier === 'MINI_EMPLOYEE' ? user.id : employment.employerId,
          tier,
          // No role assigned resolves to the tier's defaults — the access this
          // employment had before roles existed.
          services,
          employment,
          ...tenancy,
        }
      : {
          actorId: user.id,
          effectiveOwnerId: user.id,
          tier: 'OWNER',
          services,
          employment: null,
          ...tenancy,
        };
    req.actorContext = ctx;

    this.assertWritableScope(ctx, req.method);

    const allowed =
      this.reflector.getAllAndOverride<ActorTier[] | undefined>(ALLOWED_FOR_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_ALLOWED;

    if (!allowed.includes(ctx.tier)) {
      throw new ForbiddenException(
        ctx.tier === 'MINI_EMPLOYEE'
          ? 'This action is not permitted for mini employees'
          : 'This action is not permitted while acting on behalf of an employer',
      );
    }

    // Any-of: a route reachable from two features passes on either service.
    const required = this.reflector.getAllAndOverride<ServiceKey[] | undefined>(
      REQUIRES_SERVICE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length && !required.some((s) => ctx.services.has(s))) {
      throw new ForbiddenException(
        'Your role does not include this feature — ask your employer to enable it',
      );
    }
    return true;
  }

  /**
   * The tenancy half of an ActorContext: which business, which branch
   * (MULTI_SHOP_PLAN.md §3.5). Runs *after* the persona block, so a full
   * employee on `X-Acting-As: self` arrives here with `employment === null` and
   * is resolved as an owner on their own books — persona wins, as it does for
   * every other field.
   */
  private async resolveTenancy(
    userId: string,
    employment: Employment | null,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<Pick<ActorContext, 'orgId' | 'shopId' | 'visibleShopIds' | 'shopScope' | 'shopArchived'>> {
    const raw = headers[SHOP_HEADER];
    const requested = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();

    // ── Employee: hired into a branch, and cannot step out of it ─────────────
    // Both tiers, and for a mini that is the EMPLOYER's org, not their own: the
    // consigned lots on their books belong to the employer's business (§3.14).
    if (employment) {
      const orgId =
        employment.orgId ?? (await this.shopContext.orgIdOfOwner(employment.employerId));
      if (!orgId) throw new NotFoundException('No business found for this employment');

      const shopId = employment.shopId ?? (await this.shopContext.defaultShopId(orgId));
      if (!shopId) throw new NotFoundException('No branch found for this employment');

      // The header is validated, never trusted. Sending another branch — or
      // `all`, which is an owner-only scope — is an attempt to step outside the
      // employment, so it fails loudly instead of being silently ignored.
      if (requested && requested !== shopId) {
        throw new ForbiddenException('You are assigned to a different branch');
      }

      const shop = await this.shopContext.findInOrg(shopId, orgId);
      return {
        orgId,
        shopId,
        visibleShopIds: [shopId],
        shopScope: 'one',
        shopArchived: shop?.archivedAt != null,
      };
    }

    // ── Owner ────────────────────────────────────────────────────────────────
    const rawOrg = headers[ORG_HEADER];
    const requestedOrg = (Array.isArray(rawOrg) ? rawOrg[0] : rawOrg)?.trim();
    const owned = await this.shopContext.forOwner(userId, requestedOrg || undefined);

    // No header: the default shop. This single line is what keeps every
    // existing mobile install, every curl and every un-migrated screen working.
    if (!requested) {
      return {
        orgId: owned.orgId,
        shopId: owned.defaultShopId,
        visibleShopIds: owned.visibleShopIds,
        shopScope: 'one',
        shopArchived: owned.archivedShopIds.includes(owned.defaultShopId),
      };
    }

    if (requested === SHOP_SCOPE_ALL) {
      return {
        orgId: owned.orgId,
        shopId: null,
        visibleShopIds: owned.visibleShopIds,
        shopScope: 'all',
        shopArchived: false,
      };
    }

    // A shop id. `404`, not `403`, when it belongs to another organization —
    // a 403 would confirm that another merchant's shop id exists.
    const shop = await this.shopContext.findInOrg(requested, owned.orgId);
    if (!shop) throw new NotFoundException('Branch not found');

    return {
      orgId: owned.orgId,
      shopId: shop.id,
      visibleShopIds: owned.visibleShopIds,
      shopScope: 'one',
      shopArchived: shop.archivedAt != null,
    };
  }

  /**
   * Two write rules, enforced centrally so 23 services do not each have to
   * remember them.
   *
   * A write under `all` is ambiguous by construction — "add this product to all
   * my shops" is a different feature, not this one. And an archived branch is
   * readable forever, writable never (§3.1): its history stays, its books close.
   *
   * Keying off the HTTP method rather than a decorator means a new endpoint is
   * covered the day it is written, which is the opposite of the failure mode
   * this feature is most exposed to.
   */
  private assertWritableScope(ctx: ActorContext, method?: string): void {
    if (!method || method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD') return;

    if (ctx.shopScope === 'all') {
      throw new BadRequestException({
        message: 'Select a shop for this action',
        code: SHOP_REQUIRED_CODE,
      });
    }
    if (ctx.shopArchived) {
      throw new ConflictException('This branch is closed — reopen it to make changes');
    }
  }
}
