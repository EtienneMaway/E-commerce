import { QuantityDiscountsService } from './quantity-discounts.service';
import { QuantityDiscount } from '../entities';

/**
 * Coverage for the config store: `get` returns a disabled/zeroed default when no
 * row exists, both `get` and `upsert` normalise percentages to 2dp strings, and
 * `upsert` creates-or-updates the single per-owner row.
 */
describe('QuantityDiscountsService', () => {
  const OWNER = 'owner-1';

  function makeService(row: QuantityDiscount | null) {
    const store = { current: row };
    const repo = {
      findOne: jest.fn(async () => store.current),
      create: jest.fn((obj: Partial<QuantityDiscount>) => ({ ...obj }) as QuantityDiscount),
      save: jest.fn(async (obj: QuantityDiscount) => {
        store.current = obj;
        return obj;
      }),
    };
    return { service: new QuantityDiscountsService(repo as never), repo, store };
  }

  it('returns a disabled default when the owner has no config', async () => {
    const { service } = makeService(null);
    const cfg = await service.get(OWNER);
    expect(cfg).toEqual({
      enabled: false,
      halfDozenPercent: '0.00',
      dozenPercent: '0.00',
      cartonPercent: '0.00',
      updatedAt: null,
    });
  });

  it('returns the stored config, percentages normalised to 2dp', async () => {
    const { service } = makeService({
      id: 'x',
      ownerId: OWNER,
      enabled: true,
      halfDozenPercent: '3',
      dozenPercent: '5.5',
      cartonPercent: '8',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as QuantityDiscount);
    const cfg = await service.get(OWNER);
    expect(cfg.enabled).toBe(true);
    expect(cfg.halfDozenPercent).toBe('3.00');
    expect(cfg.dozenPercent).toBe('5.50');
    expect(cfg.cartonPercent).toBe('8.00');
  });

  it('creates a new row on first upsert and normalises to 2dp', async () => {
    const { service, repo } = makeService(null);
    const cfg = await service.upsert(OWNER, {
      enabled: true,
      halfDozenPercent: 3,
      dozenPercent: 5,
      cartonPercent: 8,
    });
    expect(repo.create).toHaveBeenCalledWith({ ownerId: OWNER });
    expect(cfg).toEqual({
      enabled: true,
      halfDozenPercent: '3.00',
      dozenPercent: '5.00',
      cartonPercent: '8.00',
      updatedAt: null,
    });
  });

  it('updates the existing row on a later upsert', async () => {
    const existing = {
      id: 'x',
      ownerId: OWNER,
      enabled: false,
      halfDozenPercent: '1.00',
      dozenPercent: '2.00',
      cartonPercent: '3.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as QuantityDiscount;
    const { service, repo } = makeService(existing);
    const cfg = await service.upsert(OWNER, {
      enabled: true,
      halfDozenPercent: 4,
      dozenPercent: 6,
      cartonPercent: 10,
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(cfg.enabled).toBe(true);
    expect(cfg.halfDozenPercent).toBe('4.00');
    expect(cfg.cartonPercent).toBe('10.00');
  });
});
