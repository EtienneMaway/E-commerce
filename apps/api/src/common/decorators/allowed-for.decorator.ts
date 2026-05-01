import { SetMetadata } from '@nestjs/common';
import { ActorTier } from '../types/actor-context';

export const ALLOWED_FOR_KEY = 'allowedFor';

/**
 * Restrict a route to specific actor tiers.
 *
 * Tiers:
 *  - OWNER: user with no active employment (acts on their own books)
 *  - FULL_EMPLOYEE: user with active FULL employment (acts on employer's books, dashboard + mobile)
 *  - MINI_EMPLOYEE: user with active SALES_ONLY employment (mobile only, direct sales)
 *
 * Routes without this decorator default to OWNER + FULL_EMPLOYEE (read/write actions an employee
 * can perform). Use @AllowedFor('OWNER') for owner-only routes, or include 'MINI_EMPLOYEE' to allow
 * mini employees.
 */
export const AllowedFor = (...tiers: ActorTier[]) => SetMetadata(ALLOWED_FOR_KEY, tiers);
