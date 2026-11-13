/**
 * Where the dashboard's saved query cache lives (see lib/query-persist.ts).
 * Kept apart from the persister so the auth store — loaded on /login too — can
 * delete it without pulling the persistence library into public pages.
 */
export const QUERY_CACHE_KEY = 'kmb_query_cache';

export function clearPersistedQueryCache(): void {
  try {
    localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {
    /* storage unavailable — nothing was saved */
  }
}
