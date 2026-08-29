import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EmployeeRole, Employment } from '../entities';
import { EmployeeRolesService } from './employee-roles.service';

const OWNER = 'owner-1';

/** Raw rows the grouped assignment count returns. */
type CountRow = { roleId: string; count: string };

function build(opts: {
  roles?: Partial<EmployeeRole>[];
  /** Row returned by the case-insensitive name-clash lookup. */
  nameClash?: Partial<EmployeeRole> | null;
  counts?: CountRow[];
} = {}) {
  const roleRepo = {
    find: jest.fn().mockResolvedValue(opts.roles ?? []),
    findOne: jest.fn().mockResolvedValue(opts.roles?.[0] ?? null),
    create: jest.fn((row: Partial<EmployeeRole>) => row),
    save: jest.fn((row: Partial<EmployeeRole>) => Promise.resolve({ id: 'role-1', ...row })),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(opts.nameClash ?? null),
    })),
  } as unknown as Repository<EmployeeRole>;

  const employmentRepo = {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(opts.counts ?? []),
    })),
  } as unknown as Repository<Employment>;

  return { service: new EmployeeRolesService(roleRepo, employmentRepo), roleRepo, employmentRepo };
}

describe('EmployeeRolesService.getCatalog', () => {
  it('serves groups, services and presets for the role editor', () => {
    const { service } = build();
    const catalog = service.getCatalog();
    expect(catalog.groups.length).toBeGreaterThan(0);
    expect(catalog.services.length).toBeGreaterThan(0);
    expect(catalog.presets.length).toBeGreaterThan(0);
    // Keys only — labels come from each client's i18n.
    expect(catalog.services[0]).toHaveProperty('key');
    expect(catalog.services[0]).not.toHaveProperty('label');
  });
});

describe('EmployeeRolesService.create', () => {
  it('stores the expanded service list, sorted', async () => {
    const { service, roleRepo } = build();
    await service.create(OWNER, { name: 'Cashier', services: ['sales.record'] });
    const saved = (roleRepo.save as jest.Mock).mock.calls[0][0] as EmployeeRole;
    // `sales.record` implies `inventory.view` — the stored row says what it grants.
    expect(saved.services).toEqual(['inventory.view', 'sales.record']);
  });

  it('trims the name and empty descriptions to null', async () => {
    const { service, roleRepo } = build();
    await service.create(OWNER, { name: '  Cashier  ', description: '   ', services: [] });
    const saved = (roleRepo.save as jest.Mock).mock.calls[0][0] as EmployeeRole;
    expect(saved.name).toBe('Cashier');
    expect(saved.description).toBeNull();
  });

  it('accepts an empty service list', async () => {
    const { service, roleRepo } = build();
    await service.create(OWNER, { name: 'Suspended', services: [] });
    const saved = (roleRepo.save as jest.Mock).mock.calls[0][0] as EmployeeRole;
    expect(saved.services).toEqual([]);
  });

  it('refuses a name the employer already uses, case-insensitively', async () => {
    const { service } = build({ nameClash: { id: 'other', name: 'Cashier' } });
    await expect(
      service.create(OWNER, { name: 'cashier', services: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('EmployeeRolesService.update', () => {
  it('leaves fields alone when they are omitted', async () => {
    const existing = { id: 'role-1', ownerId: OWNER, name: 'Cashier', description: 'x', services: ['sales.record'] };
    const { service, roleRepo } = build({ roles: [existing as Partial<EmployeeRole>] });
    await service.update(OWNER, 'role-1', {});
    const saved = (roleRepo.save as jest.Mock).mock.calls[0][0] as EmployeeRole;
    expect(saved.name).toBe('Cashier');
    expect(saved.description).toBe('x');
    expect(saved.services).toEqual(['sales.record']);
  });

  it('replaces the service list wholesale and re-expands it', async () => {
    const existing = { id: 'role-1', ownerId: OWNER, name: 'Cashier', description: null, services: ['sales.record'] };
    const { service, roleRepo } = build({ roles: [existing as Partial<EmployeeRole>] });
    await service.update(OWNER, 'role-1', { services: ['suppliers.pay'] });
    const saved = (roleRepo.save as jest.Mock).mock.calls[0][0] as EmployeeRole;
    expect(saved.services).toEqual(['suppliers.pay', 'suppliers.view']);
  });

  it('404s on another employer\'s role', async () => {
    const { service } = build({ roles: [] });
    await expect(service.update(OWNER, 'role-9', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EmployeeRolesService.remove', () => {
  it('refuses while the role is still assigned', async () => {
    const existing = { id: 'role-1', ownerId: OWNER, name: 'Cashier', services: [] };
    const { service, roleRepo } = build({
      roles: [existing as Partial<EmployeeRole>],
      counts: [{ roleId: 'role-1', count: '2' }],
    });
    // Cascading to role_id = NULL would mean "tier defaults" — wider access as a
    // side effect of a delete. Must refuse instead.
    await expect(service.remove(OWNER, 'role-1')).rejects.toBeInstanceOf(ConflictException);
    expect(roleRepo.remove).not.toHaveBeenCalled();
  });

  it('deletes when nobody holds it', async () => {
    const existing = { id: 'role-1', ownerId: OWNER, name: 'Cashier', services: [] };
    const { service, roleRepo } = build({ roles: [existing as Partial<EmployeeRole>], counts: [] });
    await service.remove(OWNER, 'role-1');
    expect(roleRepo.remove).toHaveBeenCalled();
  });
});

describe('EmployeeRolesService.list', () => {
  it('attaches the assigned count to each role', async () => {
    const roles = [
      { id: 'role-1', ownerId: OWNER, name: 'Cashier', services: [] },
      { id: 'role-2', ownerId: OWNER, name: 'Stock', services: [] },
    ] as Partial<EmployeeRole>[];
    const { service } = build({ roles, counts: [{ roleId: 'role-1', count: '3' }] });
    const listed = await service.list(OWNER);
    expect(listed[0].assignedCount).toBe(3);
    expect(listed[1].assignedCount).toBe(0);
  });

  it('skips the count query entirely when there are no roles', async () => {
    const { service, employmentRepo } = build({ roles: [] });
    await expect(service.list(OWNER)).resolves.toEqual([]);
    expect(employmentRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
