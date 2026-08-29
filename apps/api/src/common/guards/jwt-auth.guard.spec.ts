import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmploymentStatus, EmploymentTier } from '../../entities';
import { EmploymentsService } from '../../employments/employments.service';
import { ALLOWED_FOR_KEY } from '../decorators/allowed-for.decorator';
import { REQUIRES_SERVICE_KEY } from '../decorators/requires-service.decorator';
import { ServiceKey } from '../services/service-catalog';
import { ActorContext, ActorTier } from '../types/actor-context';
import { JwtAuthGuard } from './jwt-auth.guard';

interface Case {
  /** Employment to return from findActiveAsEmployee — null = plain owner. */
  employment?: {
    tier: EmploymentTier;
    role?: { services: string[] } | null;
  } | null;
  isMiniEmployee?: boolean;
  actingAs?: string;
  allowedFor?: ActorTier[];
  requiresService?: ServiceKey[];
}

interface Run {
  /** Read `req.actorContext` only AFTER awaiting `result` — the guard sets it mid-flight. */
  req: { actorContext?: ActorContext };
  result: Promise<boolean>;
}

function run(c: Case): Run {
  const employment = c.employment
    ? {
        id: 'emp-1',
        employerId: 'employer-1',
        employeeId: 'user-1',
        status: EmploymentStatus.ACTIVE,
        tier: c.employment.tier,
        role: c.employment.role ?? null,
      }
    : null;

  const employmentsService = {
    findActiveAsEmployee: jest.fn().mockResolvedValue(employment),
  } as unknown as EmploymentsService;

  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === ALLOWED_FOR_KEY
        ? c.allowedFor
        : key === REQUIRES_SERVICE_KEY
          ? c.requiresService
          : undefined,
    ),
  } as unknown as Reflector;

  const req: { user: unknown; headers: Record<string, string>; actorContext?: ActorContext } = {
    user: { id: 'user-1', isMiniEmployee: c.isMiniEmployee ?? false },
    headers: c.actingAs ? { 'x-acting-as': c.actingAs } : {},
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;

  const guard = new JwtAuthGuard(reflector, employmentsService);
  const result = guard.canActivate(context) as Promise<boolean>;
  return { req, result };
}

beforeAll(() => {
  // Stub Passport's JWT verification — this suite exercises the authorization
  // half of the guard, which runs after `super.canActivate` resolves true.
  const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: () => Promise<boolean>;
  };
  jest.spyOn(parent, 'canActivate').mockResolvedValue(true);
});

describe('JwtAuthGuard — actor context', () => {
  it('resolves an unemployed user to OWNER on their own books', async () => {
    const { req, result } = run({ employment: null });
    await expect(result).resolves.toBe(true);
    expect(req.actorContext?.tier).toBe('OWNER');
    expect(req.actorContext?.effectiveOwnerId).toBe('user-1');
  });

  it('points a full employee at the employer books, a mini at their own', async () => {
    const full = run({ employment: { tier: EmploymentTier.FULL } });
    await full.result;
    expect(full.req.actorContext?.effectiveOwnerId).toBe('employer-1');

    const mini = run({
      employment: { tier: EmploymentTier.SALES_ONLY },
      allowedFor: ['OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE'],
    });
    await mini.result;
    expect(mini.req.actorContext?.effectiveOwnerId).toBe('user-1');
  });
});

describe('JwtAuthGuard — @AllowedFor tier ceiling', () => {
  it('refuses a mini on a route that omits their tier', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.SALES_ONLY },
      allowedFor: ['OWNER', 'FULL_EMPLOYEE'],
    });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a full employee on an owner-only route', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL },
      allowedFor: ['OWNER'],
    });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('JwtAuthGuard — @RequiresService role gate', () => {
  it('lets an ungated route through whatever the role says', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: [] } },
    });
    await expect(result).resolves.toBe(true);
  });

  it('refuses a gated route when the role omits the service', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: ['sales.record'] } },
      requiresService: ['inventory.receive'],
    });
    await expect(result).rejects.toThrow(/role does not include this feature/);
  });

  it('allows a gated route when the role grants the service', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: ['inventory.receive'] } },
      requiresService: ['inventory.receive'],
    });
    await expect(result).resolves.toBe(true);
  });

  it('allows a gated route on an implied service', async () => {
    // `sales.record` implies `inventory.view`.
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: ['sales.record'] } },
      requiresService: ['inventory.view'],
    });
    await expect(result).resolves.toBe(true);
  });

  it('is any-of across several required services', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: ['inventory.receive'] } },
      requiresService: ['inventory.add_personal', 'inventory.receive'],
    });
    await expect(result).resolves.toBe(true);
  });

  it('never lets a role widen past the tier ceiling', async () => {
    // The role grants `withdrawals`; @AllowedFor still refuses it first.
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: ['withdrawals'] } },
      allowedFor: ['OWNER'],
      requiresService: ['withdrawals'],
    });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('JwtAuthGuard — an employee with no role has no access', () => {
  it('refuses every gated route to a role-less full employee', async () => {
    for (const service of ['inventory.receive', 'sales.record', 'cash.overview'] as const) {
      const { result } = run({
        employment: { tier: EmploymentTier.FULL, role: null },
        requiresService: [service],
      });
      await expect(result).rejects.toThrow(/role does not include this feature/);
    }
  });

  it('refuses a role-less mini everything except handing takings back', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.SALES_ONLY, role: null },
      allowedFor: ['MINI_EMPLOYEE'],
      requiresService: ['sales.record'],
    });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);

    const handover = run({
      employment: { tier: EmploymentTier.SALES_ONLY, role: null },
      allowedFor: ['MINI_EMPLOYEE'],
      requiresService: ['handovers.mini'],
    });
    await expect(handover.result).resolves.toBe(true);
  });

  it('still lets them reach the always-on core (routes with no @RequiresService)', async () => {
    // Identity, own salary and leaving the job carry no service gate at all, so
    // a role-less employee is never trapped.
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: null },
      allowedFor: ['OWNER', 'FULL_EMPLOYEE'],
    });
    await expect(result).resolves.toBe(true);
  });

  it('lets an owner do everything', async () => {
    const { result } = run({ employment: null, requiresService: ['inventory.receive'] });
    await expect(result).resolves.toBe(true);
  });
});

describe('JwtAuthGuard — X-Acting-As: self', () => {
  it('gives a full employee full owner access on their own books', async () => {
    const { req, result } = run({
      employment: { tier: EmploymentTier.FULL, role: { services: [] } },
      actingAs: 'self',
      requiresService: ['inventory.receive'],
    });
    await expect(result).resolves.toBe(true);
    expect(req.actorContext?.tier).toBe('OWNER');
    expect(req.actorContext?.effectiveOwnerId).toBe('user-1');
  });

  it('does not let a mini escape their tier with it', async () => {
    const { req, result } = run({
      employment: { tier: EmploymentTier.SALES_ONLY, role: { services: [] } },
      actingAs: 'self',
      allowedFor: ['OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE'],
    });
    await expect(result).resolves.toBe(true);
    expect(req.actorContext?.tier).toBe('MINI_EMPLOYEE');
  });
});
