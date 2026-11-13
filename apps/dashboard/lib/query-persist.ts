import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { removeOldestQuery, type PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { QUERY_CACHE_KEY } from './query-cache-key';

/**
 * Keeps the React Query cache in localStorage between visits, as the mobile
 * app already does with AsyncStorage.
 *
 * Why: a refresh, a new tab or reopening the dashboard used to start from an
 * empty cache, so every screen showed a spinner until its requests came back —
 * seconds each on a 3G link. With the cache restored, the screen paints the
 * last known figures at once and React Query refreshes them in the background
 * (their `staleTime` has long passed), so nothing stays stale for long.
 *
 * Safety:
 * - `buster` carries the signed-in user's id: another account on the same
 *   browser can never be served this user's books — the saved cache is
 *   discarded on mismatch.
 * - Switching branch or persona already clears the in-memory cache, and the
 *   persister mirrors that, so the saved copy never mixes branches.
 * - Signing out deletes it (`clearPersistedQueryCache`, called by
 *   `auth.store.logout`).
 * - Only successful queries are saved; errors are never replayed.
 * - Bump `CACHE_VERSION` when a response shape changes incompatibly.
 */
const CACHE_VERSION = 'v1';
/** Older than this, a saved cache is dropped rather than shown. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function currentUserId(): string {
  try {
    const raw = localStorage.getItem('auth_user');
    const id: unknown = raw ? (JSON.parse(raw) as { id?: unknown }).id : null;
    return typeof id === 'string' ? id : 'anon';
  } catch {
    return 'anon';
  }
}

/**
 * localStorage, guarded two ways:
 * - private mode / blocked storage: `undefined`, so nothing is saved;
 * - signed out: writes are refused. Signing out deletes the saved cache, but
 *   the still-mounted persister would otherwise write it straight back a
 *   moment later (its writes are throttled, and in-flight queries settle).
 */
const safeStorage: Storage | undefined = (() => {
  try {
    const probe = '__kmb_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    return undefined;
  }
  const signedIn = (): boolean => {
    try {
      return !!localStorage.getItem('auth_token');
    } catch {
      return false;
    }
  };
  return {
    get length() {
      return localStorage.length;
    },
    key: (i: number) => localStorage.key(i),
    getItem: (k: string) => localStorage.getItem(k),
    removeItem: (k: string) => localStorage.removeItem(k),
    clear: () => localStorage.clear(),
    setItem: (k: string, v: string) => {
      if (signedIn()) localStorage.setItem(k, v);
    },
  };
})();

export function persistOptions(): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister: createSyncStoragePersister({
      storage: safeStorage,
      key: QUERY_CACHE_KEY,
      // One write per second at most, however many queries settle.
      throttleTime: 1000,
      // Storage full: drop the oldest query and try again rather than fail.
      retry: removeOldestQuery,
    }),
    maxAge: MAX_AGE_MS,
    buster: `${CACHE_VERSION}:${currentUserId()}`,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => q.state.status === 'success',
    },
  };
}
