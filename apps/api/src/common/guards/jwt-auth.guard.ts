import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { EmploymentTier, User } from '../../entities';
import { EmploymentsService } from '../../employments/employments.service';
import { ALLOWED_FOR_KEY } from '../decorators/allowed-for.decorator';
import { ActorContext, ActorTier } from '../types/actor-context';

const DEFAULT_ALLOWED: ActorTier[] = ['OWNER', 'FULL_EMPLOYEE'];

/**
 * Authenticates via JWT (Passport) and, on success:
 *   1. Resolves the request's ActorContext (actor / effectiveOwnerId / tier).
 *   2. Enforces the @AllowedFor tier allowlist (default: OWNER + FULL_EMPLOYEE).
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
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest<{
      user: User;
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

    const employment =
      actingAs === 'self'
        ? null
        : await this.employmentsService.findActiveAsEmployee(user.id);

    const ctx: ActorContext = employment
      ? {
          actorId: user.id,
          effectiveOwnerId: employment.employerId,
          tier: employment.tier === EmploymentTier.SALES_ONLY ? 'MINI_EMPLOYEE' : 'FULL_EMPLOYEE',
          employment,
        }
      : {
          actorId: user.id,
          effectiveOwnerId: user.id,
          tier: 'OWNER',
          employment: null,
        };
    req.actorContext = ctx;

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
    return true;
  }
}
