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
 */
export interface ActorContext {
  actorId: string;
  effectiveOwnerId: string;
  tier: ActorTier;
  services: ReadonlySet<ServiceKey>;
  employment: Employment | null;
}
