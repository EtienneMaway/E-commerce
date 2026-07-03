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

    const ctx: ActorContext = employment
      ? {
          actorId: user.id,
          // Mini-employees operate on their OWN books: the employer consigns
          // stock to them (CONSIGNED_IN lands on the mini's books), they sell it
          // and settle by handover. Full employees operate on the employer's books.
          effectiveOwnerId: tier === 'MINI_EMPLOYEE' ? user.id : employment.employerId,
          tier,
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
