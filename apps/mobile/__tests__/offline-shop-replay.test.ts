import type { InternalAxiosRequestConfig } from 'axios';
import { api } from '../lib/api';
import { syncPendingSales } from '../lib/sync';
import { useOfflineStore } from '../store/offline.store';
import { useShopStore, type ShopSummary } from '../store/shop.store';

/**
 * MULTI_SHOP_PLAN.md §3.8 — the highest-risk item in the mobile phase: an
 * offline row must replay into the branch it was recorded at, never into
 * whichever branch is selected when the connection comes back.
 */

const SHOP_A = 'shop-a';
const SHOP_B = 'shop-b';

const shops: ShopSummary[] = [
  { id: SHOP_A, name: 'Main Shop', address: null, isDefault: true, isArchived: false },
  { id: SHOP_B, name: 'Branch Two', address: 'Avenue 1', isDefault: false, isArchived: false },
];

let sent: InternalAxiosRequestConfig[] = [];

beforeEach(async () => {
  sent = [];
  // Capture what would leave the phone, after the interceptor has run.
  api.defaults.adapter = async (config) => {
    sent.push(config);
    return { data: { id: `server-${sent.length}` }, status: 201, statusText: 'Created', headers: {}, config };
  };
  useOfflineStore.setState({ pendingSales: [], pendingRejections: [], pendingExpenses: [] });
  await useShopStore.getState().resetForLogout();
});

function shopHeader(config: InternalAxiosRequestConfig): unknown {
  return config.headers['X-Shop-Id'];
}

async function asOwner(selected: string | null): Promise<void> {
  await useShopStore.getState().setContext({
    shops,
    organization: null,
    defaultShopId: SHOP_A,
    employed: false,
  });
  if (selected) await useShopStore.getState().setShop(selected);
}

describe('offline queue replays into the branch it was recorded at', () => {
  it('a sale recorded in B lands in B after switching back to A', async () => {
    await asOwner(SHOP_B);
    useOfflineStore.getState().recordOfflineSale('rice', 2, '2.0000');
    useOfflineStore.getState().recordOfflineNormalExpense('5', 'USD', 'TRANSPORT');

    await useShopStore.getState().setShop(SHOP_A);
    const result = await syncPendingSales();

    expect(result.failed).toBe(0);
    expect(sent.map((c) => [c.url, shopHeader(c)])).toEqual([
      ['/sales', SHOP_B],
      ['/expenses', SHOP_B],
    ]);
  });

  it('a sale rejected offline is rejected in the same branch it was sold in', async () => {
    await asOwner(SHOP_B);
    useOfflineStore.getState().recordOfflineSale('rice', 1, '2.0000');
    const [queued] = useOfflineStore.getState().pendingSales;
    useOfflineStore.getState().rejectPendingSale(queued.id, 'wrong item');

    await useShopStore.getState().setShop(SHOP_A);
    await syncPendingSales();

    expect(sent.map((c) => [c.url, shopHeader(c)])).toEqual([
      ['/sales', SHOP_B],
      ['/sales/server-1/reject', SHOP_B],
    ]);
  });

  it('with no branch chosen, stamps the default branch rather than nothing', async () => {
    await asOwner(null);
    useOfflineStore.getState().recordOfflineSale('rice', 1, '2.0000');
    expect(useOfflineStore.getState().pendingSales[0].shopId).toBe(SHOP_A);
  });

  it('a row queued before branches existed replays into the default branch', async () => {
    await asOwner(SHOP_B);
    useOfflineStore.setState({
      pendingSales: [
        {
          id: 'legacy-1',
          productName: 'rice',
          qtySold: 1,
          salePrice: '2.0000',
          recordedAt: new Date().toISOString(),
          syncError: null,
        },
      ],
    });

    await syncPendingSales();

    expect(shopHeader(sent[0])).toBe(SHOP_A);
  });

  it("an employee's rows carry no branch — the API takes it from the employment", async () => {
    await useShopStore.getState().setContext({
      shops: [shops[1]],
      organization: null,
      defaultShopId: SHOP_B,
      employed: true,
    });
    useOfflineStore.getState().recordOfflineSale('rice', 1, '2.0000');
    expect(useOfflineStore.getState().pendingSales[0].shopId).toBeNull();

    await syncPendingSales();

    expect(shopHeader(sent[0])).toBeUndefined();
  });
});

describe('interactive requests', () => {
  it('carry the selected branch', async () => {
    await asOwner(SHOP_B);
    await api.get('/inventory/products');
    expect(shopHeader(sent[0])).toBe(SHOP_B);
  });

  it('send no branch for an employee, even with a stale owner selection on the phone', async () => {
    await asOwner(SHOP_B);
    await useShopStore.getState().setContext({
      shops: [shops[0]],
      organization: null,
      defaultShopId: SHOP_A,
      employed: true,
    });
    await api.get('/inventory/products');
    expect(shopHeader(sent[0])).toBeUndefined();
  });
});
