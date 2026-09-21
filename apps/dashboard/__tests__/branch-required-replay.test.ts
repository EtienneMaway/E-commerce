/**
 * The "select a branch" pause-and-replay in `lib/api.ts`.
 *
 * Driven through a stubbed axios adapter rather than a live API, so the parts
 * that are easy to get wrong are pinned: that the replay actually carries the
 * chosen branch, that backing out still surfaces the original refusal, that a
 * second refusal cannot loop, and that three simultaneous writes ask once.
 *
 * Run from the repo root:
 *   apps/api/node_modules/.bin/jest -c apps/dashboard/jest.api.config.js
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// `lib/api.ts` reads localStorage on every request for the branch and the
// persona. Node has none, so stand one up before the module is imported.
const store: Record<string, string> = {};
(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
};

import { api, setBranchChooser } from '../lib/api';

/** The refusal the API sends for a write under `X-Shop-Id: all`. */
function shopRequired(config: InternalAxiosRequestConfig): AxiosResponse {
  return {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config,
    data: {
      statusCode: 400,
      error: 'Bad Request',
      // Translated, deliberately: nothing may match on this sentence.
      message: 'Sélectionnez une boutique pour cette action',
      code: 'SHOP_REQUIRED',
    },
  };
}

interface Attempt {
  shopHeader: string | undefined;
  body: unknown;
}

/**
 * An adapter that refuses while the request carries `all`, and accepts once it
 * carries a real branch — the API's actual rule, in four lines.
 */
function branchAwareAdapter(attempts: Attempt[]): AxiosAdapter {
  return async (config) => {
    const shopHeader = config.headers['X-Shop-Id'] as string | undefined;
    attempts.push({ shopHeader, body: config.data });

    if (shopHeader === 'all' || shopHeader === undefined) {
      return Promise.reject(
        Object.assign(new Error('Request failed with status code 400'), {
          isAxiosError: true,
          config,
          response: shopRequired(config),
        }),
      );
    }
    return { status: 201, statusText: 'Created', headers: {}, config, data: { id: 'row-1' } };
  };
}

beforeEach(() => {
  store['ta_shop'] = 'all';
  setBranchChooser(null);
});

describe('a write refused for want of a branch', () => {
  it('asks, then replays the same request against the chosen branch', async () => {
    const attempts: Attempt[] = [];
    api.defaults.adapter = branchAwareAdapter(attempts);

    // What the dialog does: write the choice to the store (localStorage here),
    // then resolve. The replay re-reads it through the request interceptor.
    setBranchChooser(async () => {
      store['ta_shop'] = 'shop-b';
      return 'shop-b';
    });

    const res = await api.post('/mini-settlements/s-1/team', { name: 'Jean' });

    expect(res.data).toEqual({ id: 'row-1' });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].shopHeader).toBe('all');
    expect(attempts[1].shopHeader).toBe('shop-b');
    // The body survives the replay — this is the whole point: nobody re-types
    // the form.
    expect(attempts[1].body).toBe(attempts[0].body);
    expect(JSON.parse(attempts[1].body as string)).toEqual({ name: 'Jean' });
  });

  it('surfaces the original refusal when the user backs out', async () => {
    const attempts: Attempt[] = [];
    api.defaults.adapter = branchAwareAdapter(attempts);
    setBranchChooser(async () => null);

    await expect(api.post('/expenses', { amount: '1' })).rejects.toMatchObject({
      response: { status: 400, data: { code: 'SHOP_REQUIRED' } },
    });
    expect(attempts).toHaveLength(1);
  });

  it('surfaces it untouched when no dialog is mounted', async () => {
    const attempts: Attempt[] = [];
    api.defaults.adapter = branchAwareAdapter(attempts);

    await expect(api.post('/expenses', { amount: '1' })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(attempts).toHaveLength(1);
  });

  it('retries once and no more, so a second refusal cannot loop', async () => {
    const attempts: Attempt[] = [];
    // Refuses whatever branch it is given — a branch that is wrong for some
    // other reason, or a chooser that resolves without changing anything.
    const loopingAdapter: AxiosAdapter = async (config) => {
      attempts.push({ shopHeader: config.headers['X-Shop-Id'] as string, body: config.data });
      return Promise.reject(
        Object.assign(new Error('400'), {
          isAxiosError: true,
          config,
          response: shopRequired(config),
        }),
      );
    };
    api.defaults.adapter = loopingAdapter;

    let asked = 0;
    setBranchChooser(async () => {
      asked += 1;
      store['ta_shop'] = 'shop-b';
      return 'shop-b';
    });

    await expect(api.post('/expenses', { amount: '1' })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(attempts).toHaveLength(2);
    expect(asked).toBe(1);
  });

  it('asks once for several writes refused together', async () => {
    const attempts: Attempt[] = [];
    api.defaults.adapter = branchAwareAdapter(attempts);

    let asked = 0;
    let release: (() => void) | null = null;
    const opened = new Promise<void>((r) => {
      release = r;
    });

    setBranchChooser(
      () =>
        new Promise<string | null>((resolve) => {
          asked += 1;
          release?.();
          // Hold the dialog open long enough for the other two refusals to
          // arrive — the real one waits on a human.
          setTimeout(() => {
            store['ta_shop'] = 'shop-b';
            resolve('shop-b');
          }, 20);
        }),
    );

    const writes = Promise.all([
      api.post('/sales', { a: 1 }),
      api.post('/expenses', { b: 2 }),
      api.post('/withdrawals', { c: 3 }),
    ]);
    await opened;

    await expect(writes).resolves.toHaveLength(3);
    expect(asked).toBe(1);
    // Three refused, three replayed.
    expect(attempts).toHaveLength(6);
    expect(attempts.slice(3).every((a) => a.shopHeader === 'shop-b')).toBe(true);
  });

  it('leaves every other failure alone', async () => {
    const attempts: Attempt[] = [];
    let asked = 0;
    setBranchChooser(async () => {
      asked += 1;
      return 'shop-b';
    });

    const conflictAdapter: AxiosAdapter = async (config) => {
      attempts.push({ shopHeader: config.headers['X-Shop-Id'] as string, body: config.data });
      return Promise.reject(
        Object.assign(new Error('409'), {
          isAxiosError: true,
          config,
          response: {
            status: 409,
            statusText: 'Conflict',
            headers: {},
            config,
            data: { message: 'This branch is closed — reopen it to make changes' },
          },
        }),
      );
    };
    api.defaults.adapter = conflictAdapter;

    await expect(api.post('/expenses', { a: 1 })).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(asked).toBe(0);
    expect(attempts).toHaveLength(1);
  });
});
