import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Employment,
  EmploymentStatus,
  Organization,
  OrganizationOwnershipHistory,
  User,
} from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { OrganizationsService } from './organizations.service';
import { ShopContextService } from './shop-context.service';

const ORG = 'org-1';
const OWNER = 'owner-1';
const MANAGER = 'manager-1';

function ctx(): ActorContext {
  return {
    actorId: OWNER,
    effectiveOwnerId: OWNER,
    tier: 'OWNER',
    services: new Set(),
    employment: null,
    orgId: ORG,
    shopId: 'shop-main',
    visibleShopIds: ['shop-main'],
    shopScope: 'one',
    shopArchived: false,
  } as ActorContext;
}

function make(
  over: {
    org?: Partial<Organization> | null;
    user?: Partial<User> | null;
    /** Organizations the previous owner still has after the transfer. */
    previousOwnerKeepsOrgs?: number;
  } = {},
) {
  const org = over.org === null ? null : ({ id: ORG, ownerUserId: OWNER, pendingOwnerUserId: null, name: 'Amina Trading', ...over.org } as Organization);

  const saved: Record<string, unknown>[] = [];
  const managerUpdate = jest.fn();
  const managerQuery = jest.fn().mockResolvedValue([]);
  const orgRepo = {
    findOne: jest.fn().mockResolvedValue(org),
    count: jest.fn().mockResolvedValue(over.previousOwnerKeepsOrgs ?? 0),
    find: jest.fn().mockResolvedValue(org ? [org] : []),
    save: jest.fn((x: Organization) => Promise.resolve(x)),
    manager: {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
        fn({
          save: jest.fn((_e: unknown, x: Record<string, unknown>) => {
            saved.push(x);
            return Promise.resolve(x);
          }),
          update: managerUpdate,
          query: managerQuery,
          create: (_e: unknown, x: Record<string, unknown>) => x,
        }),
      ),
    },
  } as unknown as Repository<Organization>;

  const userRepo = {
    findOne: jest.fn().mockResolvedValue(
      over.user === null
        ? null
        : ({
            id: MANAGER,
            isMiniEmployee: false,
            isExternalEmployee: false,
            deletedAt: null,
            anonymizedAt: null,
            ...over.user,
          } as User),
    ),
  } as unknown as Repository<User>;

  const employmentRepo = { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<Employment>;

  // The previous owner is re-seeded a business only when the transfer leaves
  // them with none; `orgRepo.count` below decides that.
  const ensureForUser = jest.fn().mockResolvedValue({ orgId: 'org-new', shopId: 'shop-new' });
  const shopContext = { ensureForUser } as unknown as ShopContextService;

  return {
    service: new OrganizationsService(orgRepo, userRepo, employmentRepo, shopContext),
    ensureForUser,
    orgRepo,
    saved,
    managerUpdate,
    managerQuery,
  };
}

describe('OrganizationsService — offering the business', () => {
  it('records the nominee without changing the owner', async () => {
    // Propose-then-accept: an organization carries supplier debts and payroll,
    // so handing it over without consent hands over liabilities.
    const { service, orgRepo } = make();
    const result = await service.proposeTransfer(ctx(), { newOwnerUserId: MANAGER });
    expect(result.pendingOwnerUserId).toBe(MANAGER);
    expect(result.ownerUserId).toBe(OWNER);
    expect(orgRepo.save).toHaveBeenCalled();
  });

  it('refuses a closed account', async () => {
    const { service } = make({ user: { anonymizedAt: new Date() } });
    await expect(
      service.proposeTransfer(ctx(), { newOwnerUserId: MANAGER }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an employee profile, which cannot own anything', async () => {
    const { service } = make({ user: { isMiniEmployee: true } });
    await expect(
      service.proposeTransfer(ctx(), { newOwnerUserId: MANAGER }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does NOT refuse someone who already owns a business', async () => {
    // Every account is seeded an organization, so requiring "owns none" would
    // make every transfer impossible (§3.14). Owning two is legitimate.
    const { service } = make();
    await expect(
      service.proposeTransfer(ctx(), { newOwnerUserId: MANAGER }),
    ).resolves.toBeDefined();
  });
});

describe('OrganizationsService — accepting', () => {
  it('moves ownership, ends the nominee employment, and records the succession', async () => {
    const { service, saved, managerUpdate } = make({ org: { pendingOwnerUserId: MANAGER } });
    const result = await service.acceptTransfer(MANAGER, ORG);

    expect(result.ownerUserId).toBe(MANAGER);
    expect(result.pendingOwnerUserId).toBeNull();

    // Promoting your own manager is the common case. Left employed, the guard
    // would resolve the new owner as FULL_EMPLOYEE on their own books.
    expect(managerUpdate).toHaveBeenCalledWith(
      Employment,
      expect.objectContaining({ employerId: OWNER, employeeId: MANAGER }),
      expect.objectContaining({ status: EmploymentStatus.TERMINATED }),
    );

    const history = saved.find((row) => 'toUserId' in row);
    expect(history).toMatchObject({ orgId: ORG, fromUserId: OWNER, toUserId: MANAGER });
  });

  it("keeps the previous owner's history attributed to them", async () => {
    // actor_id NULL means "the owner of these books". After the hand-over that
    // would read as the new owner, so the NULLs are pinned to the previous one.
    const { service, managerQuery } = make({ org: { pendingOwnerUserId: MANAGER } });
    await service.acceptTransfer(MANAGER, ORG);

    const calls = managerQuery.mock.calls as [string, unknown[]][];
    const byTable = (t: string): [string, unknown[]] | undefined =>
      calls.find(([sql]) => sql.includes(`"${t}"`));

    for (const t of ['expenses', 'payments', 'external_transactions']) {
      expect(byTable(t)?.[1]).toEqual([OWNER, ORG]);
    }
    // A mini's own sales and lots also store NULL — only rows the previous
    // owner held may be re-attributed.
    for (const t of ['sale_transactions', 'inventory_entries']) {
      const call = byTable(t);
      expect(call?.[0]).toContain('"owner_id" = $1');
      expect(call?.[1]).toEqual([OWNER, ORG]);
    }
    // NULL on a settlement can be the mini or the owner — never guessed.
    expect(byTable('mini_settlements')).toBeUndefined();
  });

  it('hands the books to the new owner, after pinning the old attribution', async () => {
    // owner_id is kept as the holder on five tables, so a transfer that only
    // changed organizations.owner_user_id left the new owner reading empty stock
    // and sales, and full employees still acting for the previous owner.
    const { service, managerQuery } = make({ org: { pendingOwnerUserId: MANAGER } });
    await service.acceptTransfer(MANAGER, ORG);

    const calls = managerQuery.mock.calls as [string, unknown[]][];
    const indexOf = (pred: (sql: string) => boolean): number => calls.findIndex(([sql]) => pred(sql));

    const lastPin = Math.max(
      ...calls.map(([sql], i) => (sql.includes('SET "actor_id"') ? i : -1)),
    );
    for (const t of ['inventory_entries', 'sale_transactions', 'stock_movements', 'supplier_debts', 'debtor_credits']) {
      const i = indexOf((sql) => sql.includes(`UPDATE "${t}" SET "owner_id" = $2`));
      expect(i).toBeGreaterThan(lastPin);
      expect(calls[i][1]).toEqual([OWNER, MANAGER, ORG]);
    }
    expect(indexOf((sql) => sql.includes('UPDATE "employments" SET "employer_id" = $2'))).toBeGreaterThan(-1);
    expect(indexOf((sql) => sql.includes('UPDATE "salary_payments" SET "employer_id" = $2'))).toBeGreaterThan(-1);
    expect(indexOf((sql) => sql.includes('"paid_to_user_id" = $2'))).toBeGreaterThan(-1);
    // History stays with whoever did it.
    expect(indexOf((sql) => sql.includes('SET "actor_id" = $2'))).toBe(-1);
  });

  it('re-checks the nominee at accept, not only at propose', async () => {
    // Days pass between the two, and anything can change in them.
    const { service } = make({
      org: { pendingOwnerUserId: MANAGER },
      user: { deletedAt: new Date() },
    });
    await expect(service.acceptTransfer(MANAGER, ORG)).rejects.toBeInstanceOf(ConflictException);
  });

  it('leaves the former owner with a business of their own', async () => {
    // Transferring the business they registered with leaves them administering
    // nothing, and an owner is resolved through exactly that row — so without
    // this they would 404 out of their own account entirely.
    const { service, ensureForUser } = make({
      org: { pendingOwnerUserId: MANAGER },
      previousOwnerKeepsOrgs: 0,
    });
    await service.acceptTransfer(MANAGER, ORG);
    expect(ensureForUser).toHaveBeenCalledWith(OWNER, undefined);
  });

  it('does not re-seed an owner who still runs another business', async () => {
    const { service, ensureForUser } = make({
      org: { pendingOwnerUserId: MANAGER },
      previousOwnerKeepsOrgs: 1,
    });
    await service.acceptTransfer(MANAGER, ORG);
    expect(ensureForUser).not.toHaveBeenCalled();
  });

  it('refuses someone who was never offered it', async () => {
    const { service } = make({ org: { pendingOwnerUserId: null } });
    await expect(service.acceptTransfer(MANAGER, ORG)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrganizationsService — ownsOrganizationWithData', () => {
  it('is false for a business that never traded', async () => {
    // Otherwise every account would need to invent a recipient before closing,
    // since registration seeds an organization for everyone.
    const { service } = make();
    await expect(service.ownsOrganizationWithData(OWNER)).resolves.toBe(false);
  });
});

// Kept honest about the type the transfer writes into history.
export type _History = OrganizationOwnershipHistory;
