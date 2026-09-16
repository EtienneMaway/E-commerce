import { ArgumentsHost, ConflictException } from '@nestjs/common';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { allShopsCtx, testCtx } from '../common/testing/actor-context.fixture';
import type { ActorContext } from '../common/types/actor-context';
import { DashboardService } from '../dashboard/dashboard.service';
import { InventorySource } from '../entities';
import { InventoryService } from '../inventory/inventory.service';

/**
 * What the dashboard needs to label figures under "All branches"
 * (MULTI_SHOP_PLAN.md Phase 5), and the refusal codes the settings page turns
 * into guidance (§3.13).
 */

describe('HttpExceptionFilter refusal codes', () => {
  function run(exception: ConflictException, lang = 'fr'): Record<string, unknown> {
    let body: Record<string, unknown> = {};
    const res = {
      status: () => res,
      json: (b: Record<string, unknown>) => {
        body = b;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ headers: { 'accept-language': lang } }),
      }),
    } as unknown as ArgumentsHost;
    new HttpExceptionFilter().catch(exception, host);
    return body;
  }

  it('keeps the code beside a translated message', () => {
    const body = run(
      new ConflictException({
        message: 'Transfer your business to someone else before closing this account',
        code: 'OWNS_BUSINESS',
      }),
    );
    expect(body.code).toBe('OWNS_BUSINESS');
    expect(body.message).not.toBe(
      'Transfer your business to someone else before closing this account',
    );
  });

  it('adds no code when the exception carries none', () => {
    const body = run(new ConflictException('Email already registered'), 'en');
    expect(body).not.toHaveProperty('code');
  });
});

describe('InventoryService.getProductList shopBreakdown', () => {
  function entry(over: Record<string, unknown>): Record<string, unknown> {
    return {
      productName: 'rice',
      variantId: null,
      groupId: null,
      source: InventorySource.PERSONAL,
      quantityRemaining: 0,
      piecesPerCarton: null,
      cartonPrice: null,
      category: null,
      sellingPrice: '2.0000',
      unitCost: '1.0000',
      usdToFcRateSnapshot: null,
      shopId: 'shop-1',
      ...over,
    };
  }

  function service(entries: Record<string, unknown>[]): InventoryService {
    const svc = Object.create(InventoryService.prototype) as InventoryService;
    Object.assign(svc, {
      entryRepo: { find: jest.fn().mockResolvedValue(entries) },
      groupRepo: { find: jest.fn().mockResolvedValue([]) },
    });
    return svc;
  }

  const entries = [
    entry({ shopId: 'shop-1', quantityRemaining: 30 }),
    entry({ shopId: 'shop-2', source: InventorySource.SUPPLIER, quantityRemaining: 10 }),
    // Goods out on consignment are not sellable here, so they are not "at" a branch.
    entry({ shopId: 'shop-2', source: InventorySource.CONSIGNED_OUT, quantityRemaining: 99 }),
    // An emptied lot must not list its branch with a zero.
    entry({ shopId: 'shop-3', quantityRemaining: 0 }),
  ];

  it('splits sellable stock by branch under All branches', async () => {
    const [rice] = await service(entries).getProductList(allShopsCtx());
    expect(rice.totalAvailable).toBe(40);
    expect(rice.shopBreakdown).toEqual([
      { shopId: 'shop-1', available: 30 },
      { shopId: 'shop-2', available: 10 },
    ]);
  });

  it('sends no breakdown for a single-branch read', async () => {
    const [rice] = await service(entries).getProductList(testCtx());
    expect(rice.shopBreakdown).toBeUndefined();
  });
});

describe('DashboardService.getShopBreakdown', () => {
  function service(shops: Record<string, unknown>[]): {
    svc: DashboardService;
    seen: ActorContext[];
    find: jest.Mock;
  } {
    const seen: ActorContext[] = [];
    const find = jest.fn().mockResolvedValue(shops);
    const svc = Object.create(DashboardService.prototype) as DashboardService;
    Object.assign(svc, {
      saleRepo: { manager: { getRepository: () => ({ find }) } },
    });
    jest.spyOn(svc, 'getProfitSummary').mockImplementation(async (ctx: ActorContext) => {
      seen.push(ctx);
      return {
        period: 'today',
        dateFrom: null,
        dateTo: null,
        salesCount: ctx.shopId === 'shop-1' ? 3 : 1,
        totalQtySold: 0,
        totalRevenue: ctx.shopId === 'shop-1' ? '30.0000' : '5.0000',
        totalCost: '0.0000',
        salesProfit: '0.0000',
        externalProfit: '0.0000',
        totalProfit: ctx.shopId === 'shop-1' ? '12.0000' : '2.0000',
      };
    });
    jest.spyOn(svc, 'getCashPosition').mockImplementation(
      async (ctx: ActorContext) =>
        ({ availableBusinessCash: ctx.shopId === 'shop-1' ? '100.0000' : '-4.0000' }) as Awaited<
          ReturnType<DashboardService['getCashPosition']>
        >,
    );
    return { svc, seen, find };
  }

  const shops = [
    { id: 'shop-1', name: 'Main Shop', archivedAt: null },
    { id: 'shop-2', name: 'Kasa-Vubu', archivedAt: new Date('2026-09-01') },
  ];

  it('reads each branch through a context narrowed to that branch', async () => {
    const { svc, seen, find } = service(shops);
    const rows = await svc.getShopBreakdown(allShopsCtx(), {});

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 'org-1' } }));
    expect(seen.map((c) => [c.shopId, c.shopScope])).toEqual([
      ['shop-1', 'one'],
      ['shop-2', 'one'],
    ]);
    expect(rows).toEqual([
      {
        shopId: 'shop-1',
        shopName: 'Main Shop',
        isArchived: false,
        salesCount: 3,
        totalRevenue: '30.0000',
        totalProfit: '12.0000',
        availableBusinessCash: '100.0000',
      },
      {
        shopId: 'shop-2',
        shopName: 'Kasa-Vubu',
        isArchived: true,
        salesCount: 1,
        totalRevenue: '5.0000',
        totalProfit: '2.0000',
        availableBusinessCash: '-4.0000',
      },
    ]);
  });

  it('stays inside the selected branch when one is selected', async () => {
    const { svc, find } = service([shops[0]]);
    await svc.getShopBreakdown(testCtx(), {});
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'shop-1', orgId: 'org-1' } }),
    );
  });
});
