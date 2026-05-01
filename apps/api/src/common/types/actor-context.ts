import { Employment } from '../../entities';

export type ActorTier = 'OWNER' | 'FULL_EMPLOYEE' | 'MINI_EMPLOYEE';

/**
 * Resolved per request by EmploymentContextInterceptor.
 *
 * - actorId: the JWT user — who actually performed the request.
 * - effectiveOwnerId: which user's books to read/write against. Equals actorId
 *   for OWNER tier; equals the employer's id for FULL_EMPLOYEE / MINI_EMPLOYEE.
 * - tier: drives the @AllowedFor permission guard.
 * - employment: the active row when tier is not OWNER.
 */
export interface ActorContext {
  actorId: string;
  effectiveOwnerId: string;
  tier: ActorTier;
  employment: Employment | null;
}
