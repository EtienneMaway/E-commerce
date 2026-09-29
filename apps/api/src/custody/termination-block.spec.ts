import { ConflictException } from '@nestjs/common';
import { EmploymentsService } from '../employments/employments.service';
import { EmploymentStatus, EmploymentTier } from '../entities';

/**
 * You cannot walk away — or be walked off — holding the branch's stock
 * (`SHOP_CUSTODY_PLAN.md` §5.4).
 *
 * The block sits on BOTH ends of the termination handshake. At the request, so
 * the answer arrives before either party thinks the matter is settled; and
 * again at approval, in case a custody was opened during the notice period.
 */

const OWNER = 'owner-1';
const EMPLOYEE = 'jean-1';
const ORG = 'org-1';

const employment = (over: Record<string, unknown> = {}) =>
  ({
    id: 'emp-1',
    employerId: OWNER,
    employeeId: EMPLOYEE,
    orgId: ORG,
    shopId: 'shop-1',
    tier: EmploymentTier.FULL,
    status: EmploymentStatus.ACTIVE,
    terminationRequestedBy: null,
    ...over,
  }) as never;

function build(holding: boolean, row = employment()) {
  const repo = {
    findOne: jest.fn(async () => row),
    save: jest.fn(async (e: unknown) => e),
    count: jest.fn(async () => 0),
    find: jest.fn(async () => []),
  };
  const service = new EmploymentsService(
    repo as never,
    { findOne: jest.fn(async () => null) } as never,
    { findOne: jest.fn(async () => null), find: jest.fn(async () => []) } as never,
    { findOne: jest.fn(async () => null) } as never,
    { hasOpenCustody: jest.fn(async () => holding) } as never,
  );
  return { service, repo };
}

describe('ending an employment while stock is in their hands', () => {
  it('refuses the termination request with OPEN_CUSTODY', async () => {
    const { service } = build(true);
    await expect(service.requestTermination(OWNER, 'emp-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('carries a code, not just a sentence', async () => {
    // The message arrives translated, so a client matching on the English text
    // works in English and silently stops working in French. Same reasoning as
    // SHOP_REQUIRED and the account-deletion blocks.
    const { service } = build(true);
    await service.requestTermination(OWNER, 'emp-1').catch((e: ConflictException) => {
      expect((e.getResponse() as { code: string }).code).toBe('OPEN_CUSTODY');
    });
    expect.assertions(1);
  });

  it('refuses the approval too, in case custody opened during the notice period', async () => {
    const { service } = build(
      true,
      employment({
        status: EmploymentStatus.TERMINATION_REQUESTED,
        terminationRequestedBy: EMPLOYEE,
      }),
    );
    await expect(service.approveTermination(OWNER, 'emp-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('blocks the employee quitting, not just the employer firing', async () => {
    const { service } = build(true);
    await expect(service.requestTermination(EMPLOYEE, 'emp-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('once the stock is settled the employment ends normally', () => {
  it('lets the request through', async () => {
    const { service, repo } = build(false);
    const result = await service.requestTermination(OWNER, 'emp-1');
    expect((result as { status: EmploymentStatus }).status).toBe(
      EmploymentStatus.TERMINATION_REQUESTED,
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('lets the approval through', async () => {
    const { service } = build(
      false,
      employment({
        status: EmploymentStatus.TERMINATION_REQUESTED,
        terminationRequestedBy: EMPLOYEE,
      }),
    );
    const result = await service.approveTermination(OWNER, 'emp-1');
    expect((result as { status: EmploymentStatus }).status).toBe(EmploymentStatus.TERMINATED);
  });
});
