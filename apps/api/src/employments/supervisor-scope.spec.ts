import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EmployeeRole, Employment, EmploymentStatus, EmploymentTier, User } from '../entities';
import { EmploymentsService } from './employments.service';
import { EmploymentFilterDto } from './dto/employment-filter.dto';
import type { ActorContext } from '../common/types/actor-context';
import { resolveGrantedServices } from '../common/services/service-catalog';

const OWNER = 'owner-1';
const SUPERVISOR = 'supervisor-1';
const MINI = 'mini-1';

function ctxFor(services: string[], tier: ActorContext['tier'] = 'FULL_EMPLOYEE'): ActorContext {
  return {
    actorId: SUPERVISOR,
    effectiveOwnerId: tier === 'OWNER' ? SUPERVISOR : OWNER,
    tier,
    services: resolveGrantedServices(services, tier),
    employment: null,
  };
}

function emp(over: Partial<Employment>): Employment {
  return {
    id: 'e-1',
    employerId: OWNER,
    employeeId: MINI,
    tier: EmploymentTier.SALES_ONLY,
    status: EmploymentStatus.ACTIVE,
    monthlyPay: '300.0000',
    commissionPct: '10.00',
    ...over,
  } as Employment;
}

function build(rows: Employment[], one?: Employment) {
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue(one ?? null),
  } as unknown as Repository<Employment>;
  const service = new EmploymentsService(
    repo,
    {} as unknown as Repository<EmployeeRole>,
    {} as unknown as Repository<User>,
  );
  return { service, qb };
}

describe('EmploymentsService — supervisor scope', () => {
  const filter = {} as EmploymentFilterDto;

  it('widens the query for a supervisor who holds handovers.approve', async () => {
    const { service, qb } = build([]);
    await service.list(SUPERVISOR, filter, ctxFor(['handovers.approve']));
    expect(qb.orWhere).toHaveBeenCalled();
  });

  it('does not widen it for an employee without the service', async () => {
    const { service, qb } = build([]);
    await service.list(SUPERVISOR, filter, ctxFor(['sales.record']));
    expect(qb.orWhere).not.toHaveBeenCalled();
  });

  it('does not widen it for a mini, whatever their role says', async () => {
    const { service, qb } = build([]);
    await service.list(MINI, filter, ctxFor(['handovers.approve'], 'MINI_EMPLOYEE'));
    expect(qb.orWhere).not.toHaveBeenCalled();
  });

  it('redacts pay on rows the supervisor is not party to', async () => {
    const { service } = build([emp({})]);
    const [row] = await service.list(SUPERVISOR, filter, ctxFor(['handovers.approve']));
    // They may know who the minis are, not what colleagues are paid.
    expect(row.monthlyPay).toBeNull();
    expect(row.commissionPct).toBeNull();
  });

  it('leaves the supervisor’s own employment untouched', async () => {
    const own = emp({ id: 'e-own', employeeId: SUPERVISOR, tier: EmploymentTier.FULL });
    const { service } = build([own]);
    const [row] = await service.list(SUPERVISOR, filter, ctxFor(['handovers.approve']));
    expect(row.monthlyPay).toBe('300.0000');
  });

  it('lets a supervisor open one of their employer’s minis, pay redacted', async () => {
    const target = emp({});
    const { service } = build([], target);
    const found = await service.findOne(SUPERVISOR, 'e-1', ctxFor(['handovers.approve']));
    expect(found.id).toBe('e-1');
    expect(found.monthlyPay).toBeNull();
  });

  it('refuses a full-employee colleague, not just any row of the employer', async () => {
    // The widening is minis only — a supervisor must not read a peer's record.
    const colleague = emp({ id: 'e-2', employeeId: 'other', tier: EmploymentTier.FULL });
    const { service } = build([], colleague);
    await expect(
      service.findOne(SUPERVISOR, 'e-2', ctxFor(['handovers.approve'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a mini belonging to a different employer', async () => {
    const foreign = emp({ id: 'e-3', employerId: 'other-owner' });
    const { service } = build([], foreign);
    await expect(
      service.findOne(SUPERVISOR, 'e-3', ctxFor(['handovers.approve'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an employee without handovers.approve entirely', async () => {
    const target = emp({});
    const { service } = build([], target);
    await expect(
      service.findOne(SUPERVISOR, 'e-1', ctxFor(['sales.record'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
