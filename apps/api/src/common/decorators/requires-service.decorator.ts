import { SetMetadata } from '@nestjs/common';
import { ServiceKey } from '../services/service-catalog';

export const REQUIRES_SERVICE_KEY = 'requiresService';

/**
 * Gate a route behind one or more catalogue services. The employer decides, per
 * employee, which of these are open (see EmployeeRole).
 *
 * Semantics are ANY-OF: a route reachable from two different features passes if
 * the actor holds either.
 *
 * This runs AFTER `@AllowedFor` in JwtAuthGuard, so it can only narrow the tier
 * ceiling, never widen it. A route with no decorator is ungated — the always-on
 * core (identity, own salary, the employment lifecycle).
 */
export const RequiresService = (...services: ServiceKey[]) =>
  SetMetadata(REQUIRES_SERVICE_KEY, services);
