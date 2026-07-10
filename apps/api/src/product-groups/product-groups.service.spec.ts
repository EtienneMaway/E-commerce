import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductGroupsService } from './product-groups.service';
import { InventoryEntry, InventorySource, ProductGroup, SaleTransaction } from '../entities';

/**
 * Coverage for the sized-product read/write math: carton availability is
 * min over sizes of floor(pieces / piecesPerCarton), group creation rejects
 * duplicate labels and name clashes, and add-stock upserts per (owner, variant).
 */
describe('ProductGroupsService', () => {
  const OWNER = 'owner-1';

  function makeService(overrides?: {
    groupRepo?: Record<string, unknown>;
    variantRepo?: Record<string, unknown>;
    entryRepo?: Record<string, unknown>;
    manager?: Record<string, unknown>;
    stockMovements?: Record<string, unknown>;
  }) {
    const manager = overrides?.manager ?? {
      findOne: jest.fn(async () => null),
      create: jest.fn((_e: unknown, obj: Record<string, unknown>) => ({
        ...obj,
      })),
      save: jest.fn(async (_e: unknown, obj: unknown) => obj),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const service = new ProductGroupsService(
      (overrides?.groupRepo ?? {}) as never,
      (overrides?.variantRepo ?? {}) as never,
      (overrides?.entryRepo ?? {}) as never,
      dataSource as never,
      (overrides?.stockMovements ?? { record: jest.fn() }) as never,
    );
    return { service, manager };
  }

  describe('getGroup — carton availability', () => {
    it('computes cartonsAvailable as the min complete-set count across sizes', async () => {
      const group = {
        id: 'g1',
        ownerId: OWNER,
        name: 'casserole',
        category: 'kitchen',
        cartonSellingPrice: '220.0000',
        archived: false,
        variants: [
          {
            id: 'v-s',
            label: 'small',
            unitCost: '2.0000',
            sellingPrice: '3.0000',
            piecesPerCarton: 20,
            sortOrder: 0,
            archived: false,
          },
          {
            id: 'v-m',
            label: 'medium',
            unitCost: '3.0000',
            sellingPrice: '4.5000',
            piecesPerCarton: 20,
            sortOrder: 1,
            archived: false,
          },
          {
            id: 'v-l',
            label: 'large',
            unitCost: '4.0000',
            sellingPrice: '6.0000',
            piecesPerCarton: 20,
            sortOrder: 2,
            archived: false,
          },
        ],
      };
      const entryRepo = {
        // small 45, medium 40, large 60 → floors: 2, 2, 3 → carton min = 2
        find: jest.fn(async () => [
          {
            variantId: 'v-s',
            quantityRemaining: 45,
            source: InventorySource.PERSONAL,
          },
          {
            variantId: 'v-m',
            quantityRemaining: 40,
            source: InventorySource.PERSONAL,
          },
          {
            variantId: 'v-l',
            quantityRemaining: 60,
            source: InventorySource.SUPPLIER,
          },
        ]),
      };
      const groupRepo = { findOne: jest.fn(async () => group) };
      const { service } = makeService({ groupRepo, entryRepo });

      const result = await service.getGroup(OWNER, 'g1');

      expect(result.cartonsAvailable).toBe(2);
      expect(result.totalPieces).toBe(145);
      expect(result.variants.map((v) => v.available)).toEqual([45, 40, 60]);
    });

    it('reports 0 cartons when any gating size is fully depleted', async () => {
      const group = {
        id: 'g1',
        ownerId: OWNER,
        name: 'casserole',
        category: null,
        cartonSellingPrice: '220.0000',
        archived: false,
        variants: [
          {
            id: 'v-s',
            label: 'small',
            unitCost: '2.0000',
            sellingPrice: '3.0000',
            piecesPerCarton: 20,
            sortOrder: 0,
            archived: false,
          },
          {
            id: 'v-l',
            label: 'large',
            unitCost: '4.0000',
            sellingPrice: '6.0000',
            piecesPerCarton: 20,
            sortOrder: 1,
            archived: false,
          },
        ],
      };
      const entryRepo = {
        find: jest.fn(async () => [
          {
            variantId: 'v-s',
            quantityRemaining: 40,
            source: InventorySource.PERSONAL,
          },
          // large has none
        ]),
      };
      const groupRepo = { findOne: jest.fn(async () => group) };
      const { service } = makeService({ groupRepo, entryRepo });

      const result = await service.getGroup(OWNER, 'g1');
      expect(result.cartonsAvailable).toBe(0);
    });
  });

  describe('createGroup — validation', () => {
    const baseDto = {
      name: 'Casserole',
      variants: [
        {
          label: 'small',
          unitCost: '2.0000',
          sellingPrice: '3.0000',
          piecesPerCarton: 20,
        },
        {
          label: 'large',
          unitCost: '4.0000',
          sellingPrice: '6.0000',
          piecesPerCarton: 20,
        },
      ],
    };

    it('rejects duplicate size labels', async () => {
      const { service } = makeService();
      const dto = {
        name: 'casserole',
        variants: [
          {
            label: 'small',
            unitCost: '2.0000',
            sellingPrice: '3.0000',
            piecesPerCarton: 20,
          },
          {
            label: 'Small',
            unitCost: '2.5000',
            sellingPrice: '3.5000',
            piecesPerCarton: 20,
          },
        ],
      };
      await expect(
        service.createGroup(OWNER, dto as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when a group with the same name exists', async () => {
      const manager = {
        findOne: jest.fn(async (Entity: unknown) =>
          Entity === ProductGroup ? { id: 'existing' } : null,
        ),
        create: jest.fn(),
        save: jest.fn(),
      };
      const { service } = makeService({ manager });
      await expect(
        service.createGroup(OWNER, baseDto as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when a simple product with the same name exists', async () => {
      const manager = {
        findOne: jest.fn(async (Entity: unknown) =>
          Entity === InventoryEntry ? { id: 'entry' } : null,
        ),
        create: jest.fn(),
        save: jest.fn(),
      };
      const { service } = makeService({ manager });
      await expect(
        service.createGroup(OWNER, baseDto as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('normalizes name/labels to lowercase and persists variants', async () => {
      const saved: Record<string, unknown>[] = [];
      const manager = {
        findOne: jest.fn(async () => null),
        create: jest.fn((_e: unknown, obj: Record<string, unknown>) => ({
          ...obj,
        })),
        save: jest.fn(async (_e: unknown, obj: unknown) => {
          if (Array.isArray(obj)) return obj;
          const o = obj as Record<string, unknown>;
          if (!o.id) o.id = 'g-generated';
          saved.push(o);
          return o;
        }),
      };
      const { service } = makeService({ manager });
      const group = await service.createGroup(OWNER, baseDto as never);

      expect(group.name).toBe('casserole');
      expect(group.variants.map((v) => v.label)).toEqual(['small', 'large']);
      expect(group.variants.every((v) => v.ownerId === OWNER)).toBe(true);
    });
  });

  describe('renameGroup — cascade + guards', () => {
    function renameManager(opts: {
      count?: number;
      entriesAffected?: number;
      salesAffected?: number;
      groupClash?: unknown;
      entryClash?: unknown;
    }) {
      let lastUpdate: unknown = null;
      const chain: Record<string, jest.Mock> = {
        where: jest.fn(() => chain),
        andWhere: jest.fn(() => chain),
        set: jest.fn(() => chain),
        update: jest.fn((e: unknown) => {
          lastUpdate = e;
          return chain;
        }),
        getCount: jest.fn(async () => opts.count ?? 0),
        execute: jest.fn(async () => ({
          affected: lastUpdate === SaleTransaction ? (opts.salesAffected ?? 0) : (opts.entriesAffected ?? 0),
        })),
      };
      return {
        createQueryBuilder: jest.fn(() => chain),
        findOne: jest.fn(async (Entity: unknown) =>
          Entity === ProductGroup ? (opts.groupClash ?? null) : (opts.entryClash ?? null),
        ),
        save: jest.fn(async (_E: unknown, obj: unknown) => obj),
      };
    }

    // Fresh group per test — renameGroup mutates group.name, so a shared object
    // would leak "cocotte" into later tests and trip the no-op early return.
    const makeGroup = () => ({
      id: 'g1',
      ownerId: OWNER,
      name: 'casserole',
      variants: [{ id: 'v-s' }, { id: 'v-l' }],
    });

    it('renames and cascades to owner lots + sales when no active consigned stock', async () => {
      const manager = renameManager({ count: 0, entriesAffected: 2, salesAffected: 7 });
      const groupRepo = { findOne: jest.fn(async () => makeGroup()) };
      const { service } = makeService({ groupRepo, manager });

      const result = await service.renameGroup(OWNER, 'g1', 'Cocotte');
      expect(result).toEqual({ oldName: 'casserole', newName: 'cocotte', entriesUpdated: 2, salesUpdated: 7 });
    });

    it('blocks rename while active consigned stock exists', async () => {
      const manager = renameManager({ count: 3 });
      const groupRepo = { findOne: jest.fn(async () => makeGroup()) };
      const { service } = makeService({ groupRepo, manager });
      await expect(service.renameGroup(OWNER, 'g1', 'cocotte')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a name already used by another product', async () => {
      const manager = renameManager({ count: 0, groupClash: { id: 'other' } });
      const groupRepo = { findOne: jest.fn(async () => makeGroup()) };
      const { service } = makeService({ groupRepo, manager });
      await expect(service.renameGroup(OWNER, 'g1', 'cocotte')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('carton cost model', () => {
    it('rejects when the carton selling price is not above the buying price', async () => {
      const { service } = makeService();
      await expect(
        service.createGroup(OWNER, {
          name: 'casserole',
          cartonSellingPrice: '8.0000',
          cartonBuyingPrice: '9.0000',
          variants: [{ label: 'large', sellingPrice: '6.0000', piecesPerCarton: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('derives each size cost from the carton buying price when size cost is null', async () => {
      const group = {
        id: 'g1',
        ownerId: OWNER,
        name: 'casserole',
        category: null,
        cartonBuyingPrice: '4.5000',
        variants: [
          { id: 'v-s', label: 'small', unitCost: null, sellingPrice: '3.0000', piecesPerCarton: 1 },
          { id: 'v-l', label: 'large', unitCost: null, sellingPrice: '6.0000', piecesPerCarton: 1 },
        ],
      };
      const created: Record<string, unknown>[] = [];
      const manager = {
        findOne: jest.fn(async () => null),
        create: jest.fn((_e: unknown, obj: Record<string, unknown>) => {
          created.push(obj);
          return { ...obj, id: 'e' };
        }),
        save: jest.fn(async (_e: unknown, obj: unknown) => obj),
      };
      const groupRepo = { findOne: jest.fn(async () => group) };
      const stockMovements = { record: jest.fn(async () => ({})) };
      const { service } = makeService({ groupRepo, manager, stockMovements });

      await service.addStock(OWNER, 'g1', {
        items: [
          { variantId: 'v-s', quantity: 5 },
          { variantId: 'v-l', quantity: 5 },
        ],
      } as never);

      // total standalone = 3 + 6 = 9; carton cost 4.5 → small 1.5, large 3.0.
      expect(created.find((c) => c.variantId === 'v-s')?.unitCost).toBe('1.5000');
      expect(created.find((c) => c.variantId === 'v-l')?.unitCost).toBe('3.0000');
    });
  });

  describe('addStock — upsert per (owner, variant)', () => {
    it('tops up an existing PERSONAL lot and tags new lots with group/variant', async () => {
      const group = {
        id: 'g1',
        ownerId: OWNER,
        name: 'casserole',
        category: 'kitchen',
        variants: [
          {
            id: 'v-s',
            label: 'small',
            unitCost: '2.0000',
            sellingPrice: '3.0000',
            piecesPerCarton: 20,
          },
          {
            id: 'v-l',
            label: 'large',
            unitCost: '4.0000',
            sellingPrice: '6.0000',
            piecesPerCarton: 20,
          },
        ],
      };
      const existingSmall = {
        id: 'e-s',
        ownerId: OWNER,
        source: InventorySource.PERSONAL,
        variantId: 'v-s',
        quantityOriginal: 10,
        quantityRemaining: 10,
        unitCost: '2.0000',
        sellingPrice: '3.0000',
      };
      const created: Record<string, unknown>[] = [];
      const manager = {
        findOne: jest.fn(
          async (_e: unknown, opts: { where?: { variantId?: string } }) =>
            opts?.where?.variantId === 'v-s' ? existingSmall : null,
        ),
        create: jest.fn((_e: unknown, obj: Record<string, unknown>) => {
          created.push(obj);
          return { ...obj, id: 'new-entry' };
        }),
        save: jest.fn(async (_e: unknown, obj: unknown) => obj),
      };
      const groupRepo = { findOne: jest.fn(async () => group) };
      const stockMovements = { record: jest.fn(async () => ({})) };
      const { service } = makeService({ groupRepo, manager, stockMovements });

      const dto = {
        items: [
          { variantId: 'v-s', quantity: 5 },
          {
            variantId: 'v-l',
            quantity: 8,
            unitCost: '4.5000',
            sellingPrice: '7.0000',
          },
        ],
      };
      await service.addStock(OWNER, 'g1', dto as never);

      // small topped up 10 → 15
      expect(existingSmall.quantityRemaining).toBe(15);
      expect(existingSmall.quantityOriginal).toBe(15);
      // large created new, tagged with group + variant and per-batch price override
      const newLarge = created.find((c) => c.variantId === 'v-l');
      expect(newLarge).toMatchObject({
        groupId: 'g1',
        variantId: 'v-l',
        productName: 'casserole',
        unitCost: '4.5000',
        sellingPrice: '7.0000',
        quantityRemaining: 8,
      });
      expect(stockMovements.record).toHaveBeenCalledTimes(2);
    });

    it('rejects an item whose variant is not in the group', async () => {
      const group = {
        id: 'g1',
        ownerId: OWNER,
        name: 'casserole',
        category: null,
        variants: [{ id: 'v-s' }],
      };
      const groupRepo = { findOne: jest.fn(async () => group) };
      const { service } = makeService({ groupRepo });
      await expect(
        service.addStock(OWNER, 'g1', {
          items: [{ variantId: 'nope', quantity: 5 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
