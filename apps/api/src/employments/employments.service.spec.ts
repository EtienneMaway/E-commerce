import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmploymentsService } from './employments.service';
import { Employment, EmploymentStatus, EmploymentTier } from '../entities';
import type { CustodyService } from '../custody/custody.service';
import type { ActorContext } from '../common/types/actor-context';

const EMPLOYER = 'employer-1';
const EMPLOYEE = 'employee-1';
const ORG = 'org-1';

function ctxFor(actorId: string): ActorContext {
  return {
    actorId,
    effectiveOwnerId: actorId,
    orgId: ORG,
  } as unknown as ActorContext;
}

function employment(over: Partial<Employment> = {}): Employment {
  return {
    id: 'emp-1',
    employerId: EMPLOYER,
    employeeId: EMPLOYEE,
    orgId: ORG,
    shopId: 'shop-1',
    tier: EmploymentTier.FULL,
    status: EmploymentStatus.ACTIVE,
    pendingTier: null,
    employee: { id: EMPLOYEE, isExternalEmployee: false },
    ...over,
  } as Employment;
}

interface Options {
  employment?: Employment | null;
  holdingStock?: number;
  pendingSettlement?: number;
  hasOpenCustody?: boolean;
}

function buildService(opts: Options = {}) {
  const emp = opts.employment === undefined ? employment() : opts.employment;
  const saved: Employment[] = [];

  const employmentRepo = {
    findOne: jest.fn().mockResolvedValue(emp),
    save: jest.fn().mockImplementation((e: Employment) => {
      saved.push(e);
      return Promise.resolve(e);
    }),
    manager: {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('inventory_entries')) {
          return Promise.resolve([{ n: opts.holdingStock ?? 0 }]);
        }
        if (sql.includes('mini_settlements')) {
          return Promise.resolve([{ n: opts.pendingSettlement ?? 0 }]);
        }
        return Promise.resolve([{ n: 0 }]);
      }),
    },
  };

  const custody = {
    hasOpenCustody: jest.fn().mockResolvedValue(opts.hasOpenCustody ?? false),
  } as unknown as CustodyService;

  const service = new EmploymentsService(
    employmentRepo as never,
    {} as never,
    {} as never,
    {} as never,
    custody,
  );

  return { service, employmentRepo, custody, saved };
}

describe('EmploymentsService — tier change', () => {
  describe('proposeTierChange', () => {
    it('sets pendingTier when the employer proposes a full → mini move with no open custody', async () => {
      const { service, saved } = buildService({ hasOpenCustody: false });
      const result = await service.proposeTierChange(
        ctxFor(EMPLOYER),
        'emp-1',
        EmploymentTier.SALES_ONLY,
      );
      expect(result.pendingTier).toBe(EmploymentTier.SALES_ONLY);
      expect(saved[0].pendingTier).toBe(EmploymentTier.SALES_ONLY);
    });

    it('refuses a full → mini move while an open custody is held', async () => {
      const { service } = buildService({ hasOpenCustody: true });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a mini → full move while stock is still held', async () => {
      const { service } = buildService({
        employment: employment({ tier: EmploymentTier.SALES_ONLY }),
        holdingStock: 3,
      });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.FULL),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a mini → full move while a handover is pending', async () => {
      const { service } = buildService({
        employment: employment({ tier: EmploymentTier.SALES_ONLY }),
        pendingSettlement: 1,
      });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.FULL),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a mini → full move once settled', async () => {
      const { service, saved } = buildService({
        employment: employment({ tier: EmploymentTier.SALES_ONLY }),
        holdingStock: 0,
        pendingSettlement: 0,
      });
      const result = await service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.FULL);
      expect(result.pendingTier).toBe(EmploymentTier.FULL);
      expect(saved[0].pendingTier).toBe(EmploymentTier.FULL);
    });

    it('rejects a non-employer caller', async () => {
      const { service } = buildService();
      await expect(
        service.proposeTierChange(ctxFor('someone-else'), 'emp-1', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects proposing the tier the employment already holds', async () => {
      const { service } = buildService();
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.FULL),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a closed employment', async () => {
      const { service } = buildService({ employment: employment({ status: EmploymentStatus.TERMINATED }) });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an employee who has not accepted their invite yet', async () => {
      const { service } = buildService({ employment: employment({ status: EmploymentStatus.PENDING }) });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an employment already mid termination', async () => {
      const { service } = buildService({
        employment: employment({ status: EmploymentStatus.TERMINATION_REQUESTED }),
      });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a mini → full move even with no custody, if stock is still held (both checks always run)', async () => {
      const { service } = buildService({
        employment: employment({ tier: EmploymentTier.SALES_ONLY }),
        hasOpenCustody: false,
        holdingStock: 1,
      });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.FULL),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects external employees — they never confirm anything', async () => {
      const { service } = buildService({
        employment: employment({ employee: { id: EMPLOYEE, isExternalEmployee: true } as never }),
      });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'emp-1', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when the employment does not exist', async () => {
      const { service } = buildService({ employment: null });
      await expect(
        service.proposeTierChange(ctxFor(EMPLOYER), 'missing', EmploymentTier.SALES_ONLY),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('respondToTierChange', () => {
    it('applies the new tier and clears pendingTier on accept', async () => {
      const { service, saved } = buildService({
        employment: employment({ pendingTier: EmploymentTier.SALES_ONLY }),
        hasOpenCustody: false,
      });
      const result = await service.respondToTierChange(EMPLOYEE, 'emp-1', true);
      expect(result.tier).toBe(EmploymentTier.SALES_ONLY);
      expect(result.pendingTier).toBeNull();
      expect(saved[0].tier).toBe(EmploymentTier.SALES_ONLY);
    });

    it('clears pendingTier without changing tier on reject', async () => {
      const { service, saved } = buildService({
        employment: employment({ pendingTier: EmploymentTier.SALES_ONLY }),
      });
      const result = await service.respondToTierChange(EMPLOYEE, 'emp-1', false);
      expect(result.tier).toBe(EmploymentTier.FULL);
      expect(result.pendingTier).toBeNull();
      expect(saved[0].tier).toBe(EmploymentTier.FULL);
    });

    it('re-checks the guard at accept time and refuses if no longer settled', async () => {
      const { service } = buildService({
        employment: employment({ pendingTier: EmploymentTier.SALES_ONLY }),
        hasOpenCustody: true,
      });
      await expect(service.respondToTierChange(EMPLOYEE, 'emp-1', true)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to accept once the employment is mid termination', async () => {
      const { service } = buildService({
        employment: employment({
          pendingTier: EmploymentTier.SALES_ONLY,
          status: EmploymentStatus.TERMINATION_REQUESTED,
        }),
      });
      await expect(service.respondToTierChange(EMPLOYEE, 'emp-1', true)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('still allows rejecting a stale proposal even if the employment is mid termination', async () => {
      const { service, saved } = buildService({
        employment: employment({
          pendingTier: EmploymentTier.SALES_ONLY,
          status: EmploymentStatus.TERMINATION_REQUESTED,
        }),
      });
      const result = await service.respondToTierChange(EMPLOYEE, 'emp-1', false);
      expect(result.pendingTier).toBeNull();
      expect(result.tier).toBe(EmploymentTier.FULL);
      expect(saved[0].tier).toBe(EmploymentTier.FULL);
    });

    it('rejects a caller who is not the employee on this employment', async () => {
      const { service } = buildService({
        employment: employment({ pendingTier: EmploymentTier.SALES_ONLY }),
      });
      await expect(service.respondToTierChange('someone-else', 'emp-1', true)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('errors when nothing is pending', async () => {
      const { service } = buildService({ employment: employment({ pendingTier: null }) });
      await expect(service.respondToTierChange(EMPLOYEE, 'emp-1', true)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
