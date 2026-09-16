import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Shop } from '../entities';
import type { ActorContext } from '../common/types/actor-context';
import { ShopsService } from './shops.service';

const ORG = 'org-1';

function ctx(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: 'user-1',
    effectiveOwnerId: 'user-1',
    tier: 'OWNER',
    services: new Set(),
    employment: null,
    orgId: ORG,
    shopId: 'shop-main',
    visibleShopIds: ['shop-main'],
    shopScope: 'one',
    shopArchived: false,
    ...overrides,
  } as ActorContext;
}

function shop(over: Partial<Shop> = {}): Shop {
  return {
    id: 'shop-main',
    orgId: ORG,
    name: 'Main Shop',
    address: null,
    phone: null,
    city: null,
    note: null,
    receiptHeader: null,
    receiptFooter: null,
    isDefault: true,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Shop;
}

function make(over: { found?: Shop | null; clash?: Shop | null; query?: jest.Mock } = {}) {
  const save = jest.fn((s: Shop) => Promise.resolve(s));
  const findOne = jest.fn().mockImplementation((opts: { where: { id?: string } }) =>
    Promise.resolve(
      // A name-clash lookup passes `name`; an id lookup passes `id`.
      opts.where && 'name' in opts.where && !('id' in opts.where)
        ? (over.clash ?? null)
        : (over.found ?? null),
    ),
  );
  const repo = {
    findOne,
    find: jest.fn().mockResolvedValue([]),
    save,
    create: jest.fn((x: Partial<Shop>) => x as Shop),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    manager: {
      query: over.query ?? jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
        fn({ update: jest.fn(), save: jest.fn((_e: unknown, s: Shop) => Promise.resolve(s)) }),
      ),
    },
  } as unknown as Repository<Shop>;
  return { service: new ShopsService(repo), repo, save };
}

describe('ShopsService — a branch in another organization does not exist', () => {
  it('answers 404 rather than 403', async () => {
    const { service } = make({ found: null });
    await expect(service.findOne(ctx(), 'shop-elsewhere')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ShopsService — closing a branch', () => {
  it('refuses to archive the default branch', async () => {
    // Every request with no X-Shop-Id header — every older mobile install —
    // resolves to the default shop, and an archived shop refuses writes.
    const { service } = make({ found: shop({ isDefault: true }) });
    await expect(service.archive(ctx(), 'shop-main')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses while employees are still assigned there', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 2 }]);
    const { service } = make({ found: shop({ isDefault: false }), query });
    await expect(service.archive(ctx(), 'shop-b')).rejects.toBeInstanceOf(ConflictException);
  });

  it('archives a non-default branch with nobody assigned', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 0 }]);
    const { service, save } = make({ found: shop({ id: 'shop-b', isDefault: false }), query });
    await service.archive(ctx(), 'shop-b');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ archivedAt: expect.any(Date) }));
  });

  it('is idempotent — archiving twice is not an error', async () => {
    const { service } = make({ found: shop({ id: 'shop-b', isDefault: false, archivedAt: new Date() }) });
    await expect(service.archive(ctx(), 'shop-b')).resolves.toBeDefined();
  });
});

describe('ShopsService — the default flag', () => {
  it('refuses to hand the default to a closed branch', async () => {
    const { service } = make({ found: shop({ id: 'shop-b', isDefault: false, archivedAt: new Date() }) });
    await expect(service.setDefault(ctx(), 'shop-b')).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears the old default in the same transaction as it sets the new one', async () => {
    // The partial unique index allows exactly one default per organization, so
    // setting without clearing would violate it.
    const { service, repo } = make({ found: shop({ id: 'shop-b', isDefault: false }) });
    await service.setDefault(ctx(), 'shop-b');
    expect(repo.manager.transaction).toHaveBeenCalled();
  });
});

describe('ShopsService — deleting', () => {
  it('never deletes the default branch', async () => {
    const { service } = make({ found: shop({ isDefault: true }) });
    await expect(service.remove(ctx(), 'shop-main')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses once the branch holds any record', async () => {
    // Archive is the real path; delete is only for a branch created by mistake.
    const query = jest.fn().mockResolvedValue([{ held: 1 }]);
    const { service } = make({ found: shop({ id: 'shop-b', isDefault: false }), query });
    await expect(service.remove(ctx(), 'shop-b')).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes an empty branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service, repo } = make({ found: shop({ id: 'shop-b', isDefault: false }), query });
    await service.remove(ctx(), 'shop-b');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'shop-b', orgId: ORG });
  });

  it('builds a union Postgres will actually parse', async () => {
    // This shipped broken: `SELECT … LIMIT 1 UNION ALL SELECT …` is a syntax
    // error in Postgres ("syntax error at or near UNION"), so EVERY delete
    // 500'd — including the empty branch the endpoint exists for. The tests
    // above all passed, because `manager.query` is a mock and never parses the
    // string. Assert the shape itself instead: each arm parenthesised.
    const query = jest.fn().mockResolvedValue([]);
    const { service } = make({ found: shop({ id: 'shop-b', isDefault: false }), query });
    await service.remove(ctx(), 'shop-b');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).not.toMatch(/LIMIT\s+\d+\s+UNION/i);
    expect(sql).toMatch(/\)\s+UNION ALL\s+\(/);
  });
});

describe('ShopsService — what an employee may see', () => {
  it('returns only their own branch, never the list of the others', async () => {
    // Otherwise the list itself tells them how many branches the business has.
    const { service, repo } = make({ found: shop({ id: 'shop-b', isDefault: false }) });
    const rows = await service.list(ctx({ tier: 'FULL_EMPLOYEE', shopId: 'shop-b' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('shop-b');
    expect(repo.find).not.toHaveBeenCalled();
  });
});
