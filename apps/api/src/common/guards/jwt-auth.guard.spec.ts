import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmploymentStatus, EmploymentTier } from '../../entities';
import { EmploymentsService } from '../../employments/employments.service';
import { ShopContextService } from '../../shops/shop-context.service';
import { CustodyAccessService } from '../services/custody-access.service';
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
    /** Tenancy on the employment row. Undefined = backfilled to the defaults. */
    orgId?: string | null;
    shopId?: string | null;
  } | null;
  isMiniEmployee?: boolean;
  actingAs?: string;
  /** X-Shop-Id header value. */
  shopHeader?: string;
  /** HTTP method — drives the write rules. Defaults to GET. */
  method?: string;
  /** Shops that exist in the owner's organization, beyond the default one. */
  extraShops?: { id: string; archived?: boolean }[];
  /** Mark the owner's default shop archived. */
  defaultArchived?: boolean;
  allowedFor?: ActorTier[];
  requiresService?: ServiceKey[];
  /** Whether the employee is the current custodian of an OPEN custody row at their shop. */
  isCustodian?: boolean;
}

const ORG = 'org-1';
const DEFAULT_SHOP = 'shop-default';
const EMPLOYER_ORG = 'org-employer';
const EMPLOYMENT_SHOP = 'shop-branch-b';

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
        orgId: c.employment.orgId === undefined ? EMPLOYER_ORG : c.employment.orgId,
        shopId: c.employment.shopId === undefined ? EMPLOYMENT_SHOP : c.employment.shopId,
      }
    : null;

  const employmentsService = {
    findActiveAsEmployee: jest.fn().mockResolvedValue(employment),
  } as unknown as EmploymentsService;

  // The owner's organization: one default shop plus whatever the case adds.
  const ownerShops = [
    { id: DEFAULT_SHOP, orgId: ORG, archivedAt: c.defaultArchived ? new Date() : null },
    ...(c.extraShops ?? []).map((s) => ({
      id: s.id,
      orgId: ORG,
      archivedAt: s.archived ? new Date() : null,
    })),
  ];
  const employeeShop = { id: EMPLOYMENT_SHOP, orgId: EMPLOYER_ORG, archivedAt: null };

  const shopContext = {
    forOwner: jest.fn().mockResolvedValue({
      orgId: ORG,
      defaultShopId: DEFAULT_SHOP,
      visibleShopIds: ownerShops.filter((s) => !s.archivedAt).map((s) => s.id),
      archivedShopIds: ownerShops.filter((s) => s.archivedAt).map((s) => s.id),
    }),
    findInOrg: jest.fn((shopId: string, orgId: string) =>
      Promise.resolve(
        [...ownerShops, employeeShop].find((s) => s.id === shopId && s.orgId === orgId) ?? null,
      ),
    ),
    defaultShopId: jest.fn().mockResolvedValue(EMPLOYMENT_SHOP),
    orgIdOfOwner: jest.fn().mockResolvedValue(EMPLOYER_ORG),
  } as unknown as ShopContextService;

  const custodyAccess = {
    isCurrentCustodian: jest.fn().mockResolvedValue(c.isCustodian ?? false),
  } as unknown as CustodyAccessService;

  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === ALLOWED_FOR_KEY
        ? c.allowedFor
        : key === REQUIRES_SERVICE_KEY
          ? c.requiresService
          : undefined,
    ),
  } as unknown as Reflector;

  const req: {
    user: unknown;
    method?: string;
    headers: Record<string, string>;
    actorContext?: ActorContext;
  } = {
    user: { id: 'user-1', isMiniEmployee: c.isMiniEmployee ?? false },
    method: c.method ?? 'GET',
    headers: {
      ...(c.actingAs ? { 'x-acting-as': c.actingAs } : {}),
      ...(c.shopHeader ? { 'x-shop-id': c.shopHeader } : {}),
    },
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;

  const guard = new JwtAuthGuard(reflector, employmentsService, shopContext, custodyAccess);
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

describe('JwtAuthGuard — custody.hold from appointment, not just role', () => {
  it('refuses a full employee with no role and no custody appointment', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL, role: null },
      requiresService: ['custody.hold'],
      isCustodian: false,
    });
    await expect(result).rejects.toThrow(/role does not include this feature/);
  });

  it('grants custody.hold to whoever is currently the appointed custodian, role or not', async () => {
    const { req, result } = run({
      employment: { tier: EmploymentTier.FULL, role: null },
      requiresService: ['custody.hold'],
      isCustodian: true,
    });
    await expect(result).resolves.toBe(true);
    expect(req.actorContext?.services.has('custody.hold')).toBe(true);
  });

  it('never grants custody.hold to a mini, even if somehow named a custodian', async () => {
    const { req, result } = run({
      employment: { tier: EmploymentTier.SALES_ONLY, role: null },
      allowedFor: ['OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE'],
      isCustodian: true,
    });
    await expect(result).resolves.toBe(true);
    expect(req.actorContext?.services.has('custody.hold')).toBe(false);
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

describe('JwtAuthGuard — shop resolution (MULTI_SHOP_PLAN.md §3.5)', () => {
  it('sends an owner with no header to their default shop', async () => {
    // The single rule that keeps every existing mobile install, every curl and
    // every un-migrated screen working unchanged.
    const { req, result } = run({ employment: null });
    await result;
    expect(req.actorContext?.orgId).toBe(ORG);
    expect(req.actorContext?.shopId).toBe(DEFAULT_SHOP);
    expect(req.actorContext?.shopScope).toBe('one');
  });

  it('honours an explicit shop the owner owns', async () => {
    const { req, result } = run({
      employment: null,
      extraShops: [{ id: 'shop-b' }],
      shopHeader: 'shop-b',
    });
    await result;
    expect(req.actorContext?.shopId).toBe('shop-b');
    expect(req.actorContext?.visibleShopIds).toEqual([DEFAULT_SHOP, 'shop-b']);
  });

  it('answers 404, not 403, for a shop in another organization', async () => {
    // A 403 would confirm that another merchant's shop id exists.
    const { result } = run({ employment: null, shopHeader: 'someone-elses-shop' });
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves `all` to a cross-shop read with no single shop', async () => {
    const { req, result } = run({
      employment: null,
      extraShops: [{ id: 'shop-b' }],
      shopHeader: 'all',
    });
    await result;
    expect(req.actorContext?.shopScope).toBe('all');
    expect(req.actorContext?.shopId).toBeNull();
    expect(req.actorContext?.orgId).toBe(ORG);
  });

  it('binds a full employee to the branch they were hired into', async () => {
    const { req, result } = run({ employment: { tier: EmploymentTier.FULL } });
    await result;
    expect(req.actorContext?.orgId).toBe(EMPLOYER_ORG);
    expect(req.actorContext?.shopId).toBe(EMPLOYMENT_SHOP);
    expect(req.actorContext?.visibleShopIds).toEqual([EMPLOYMENT_SHOP]);
  });

  it('puts a mini on the EMPLOYER organization, not their own', async () => {
    // Their consigned lots sit on their own books (effectiveOwnerId) but belong
    // to the employer's business (orgId) — §3.14. Getting this backwards shows
    // the mini an empty inventory and an empty handover screen.
    const { req, result } = run({
      employment: { tier: EmploymentTier.SALES_ONLY },
      allowedFor: ['OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE'],
    });
    await result;
    expect(req.actorContext?.effectiveOwnerId).toBe('user-1');
    expect(req.actorContext?.orgId).toBe(EMPLOYER_ORG);
    expect(req.actorContext?.shopId).toBe(EMPLOYMENT_SHOP);
  });

  it('refuses an employee who asks for a different branch', async () => {
    const { result } = run({
      employment: { tier: EmploymentTier.FULL },
      shopHeader: 'shop-b',
    });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an employee who asks for `all`', async () => {
    // Cross-shop viewing is a future capability gated on a service key, never a
    // header an employee can assert for themselves.
    const { result } = run({
      employment: { tier: EmploymentTier.FULL },
      shopHeader: 'all',
    });
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the employee sending their own shop id', async () => {
    const { req, result } = run({
      employment: { tier: EmploymentTier.FULL },
      shopHeader: EMPLOYMENT_SHOP,
    });
    await result;
    expect(req.actorContext?.shopId).toBe(EMPLOYMENT_SHOP);
  });

  it('falls back to the employer default when an employment predates shops', async () => {
    const { req, result } = run({
      employment: { tier: EmploymentTier.FULL, orgId: null, shopId: null },
    });
    await result;
    expect(req.actorContext?.orgId).toBe(EMPLOYER_ORG);
    expect(req.actorContext?.shopId).toBe(EMPLOYMENT_SHOP);
  });

  it('gives a full employee acting as `self` their OWN organization', async () => {
    // Persona wins: with no employment applied they are an owner on their own
    // books, so the tenancy must follow them there too.
    const { req, result } = run({
      employment: { tier: EmploymentTier.FULL },
      actingAs: 'self',
    });
    await result;
    expect(req.actorContext?.tier).toBe('OWNER');
    expect(req.actorContext?.orgId).toBe(ORG);
    expect(req.actorContext?.shopId).toBe(DEFAULT_SHOP);
  });
});

describe('JwtAuthGuard — writes need a single, open shop (§3.6, §3.1)', () => {
  it('refuses any non-GET under `all`', async () => {
    // "Add this product to all my shops" is a different feature. Enforced here
    // so 23 services can assume ctx.shopId is set on every write path.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const { result } = run({ employment: null, shopHeader: 'all', method });
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('carries SHOP_REQUIRED, so the client can ask instead of just reporting', async () => {
    // The dashboard answers this refusal rather than surfacing it: it opens a
    // branch picker and replays the request (`lib/api.ts` → BranchRequiredDialog).
    // The message beside the code arrives translated, so dropping the code turns
    // the picker into a dead error toast for every French user, silently.
    const { result } = run({ employment: null, shopHeader: 'all', method: 'POST' });
    await expect(result).rejects.toMatchObject({
      response: { message: 'Select a shop for this action', code: 'SHOP_REQUIRED' },
    });
  });

  it('still allows reads under `all`', async () => {
    const { result } = run({ employment: null, shopHeader: 'all', method: 'GET' });
    await expect(result).resolves.toBe(true);
  });

  it('refuses a write to an archived branch but allows reading it', async () => {
    // Readable forever, writable never — the same instinct as keeping a
    // rejected sale instead of deleting it.
    const read = run({ employment: null, defaultArchived: true, method: 'GET' });
    await expect(read.result).resolves.toBe(true);

    const write = run({ employment: null, defaultArchived: true, method: 'POST' });
    await expect(write.result).rejects.toBeInstanceOf(ConflictException);
  });
});
