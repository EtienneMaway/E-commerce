import { Employment } from '../../entities';
import { ServiceKey } from '../services/service-catalog';

export type ActorTier = 'OWNER' | 'FULL_EMPLOYEE' | 'MINI_EMPLOYEE';

/**
 * Resolved per request by EmploymentContextInterceptor.
 *
 * - actorId: the JWT user — who actually performed the request.
 * - effectiveOwnerId: which user's books to read/write against. Equals actorId
 *   for OWNER and MINI_EMPLOYEE tiers (a mini holds consigned stock on their
 *   own books); equals the employer's id for FULL_EMPLOYEE.
 * - tier: drives the @AllowedFor permission guard.
 * - services: the catalogue services this actor holds, resolved from the
 *   employment's role (or the tier's defaults when no role is assigned).
 *   Drives the @RequiresService guard. Always populated — an OWNER simply
 *   holds every owner-default service.
 * - employment: the active row when tier is not OWNER.
 *
 * Multi-shop (MULTI_SHOP_PLAN.md §3.5) adds the tenancy pair. Note that
 * `effectiveOwnerId` and `orgId` answer different questions and can disagree:
 * a mini's consigned stock sits on *their* books (`effectiveOwnerId` = the
 * mini) but belongs to the employer's business (`orgId` = the employer's org).
 */
export type ShopScope = 'one' | 'all';

export interface ActorContext {
  actorId: string;
  effectiveOwnerId: string;
  tier: ActorTier;
  services: ReadonlySet<ServiceKey>;
  employment: Employment | null;

  /** The organization these books belong to. Resolved here, never queried on. */
  orgId: string;
  /** The single shop this request reads and writes. Null only when scope is 'all'. */
  shopId: string | null;
  /**
   * Shops to offer in the UI switcher — a UI concern, never a query input.
   * Rollups filter on `org_id` alone, which cannot go stale the way an array
   * assembled per request can (§3.10).
   */
  visibleShopIds: readonly string[];
  /** 'one' → `shopId` is set. 'all' → cross-shop READ; writes are refused. */
  shopScope: ShopScope;
  /** True when the selected shop is archived: readable forever, writable never. */
  shopArchived: boolean;
}
