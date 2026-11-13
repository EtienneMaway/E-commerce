import { useMemo } from 'react';
import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query';

/** Rows per request on infinite lists. Small on purpose: a 2G link pays per byte. */
export const MOBILE_PAGE_SIZE = 20;

/** One fetched page, normalised — the API's list endpoints use two envelopes. */
export interface PageResult<T> {
  readonly rows: T[];
  readonly total: number;
  /** Extra data the endpoint sends with page 1 (e.g. whole-filter totals). */
  readonly extra?: unknown;
}

/** `{ data, total }` (sales, inventory) → PageResult. */
export function fromDataTotal<T>(r: { data: T[]; total: number; [k: string]: unknown }): PageResult<T> {
  const { data, total, ...extra } = r;
  return { rows: data, total, extra };
}

/** `{ data, pagination: { total } }` (consignments, transfers, expenses…) → PageResult. */
export function fromPaginated<T>(r: { data: T[]; pagination: { total: number } }): PageResult<T> {
  return { rows: r.data, total: r.pagination.total };
}

/** The next page to ask for, or undefined once everything the server has is loaded. */
export function nextPageParam<T>(last: PageResult<T>, _all: PageResult<T>[], lastPageParam: number): number | undefined {
  return lastPageParam * MOBILE_PAGE_SIZE < last.total ? lastPageParam + 1 : undefined;
}

interface Options<T> {
  readonly queryKey: QueryKey;
  readonly fetchPage: (page: number) => Promise<PageResult<T>>;
  readonly enabled?: boolean;
  readonly staleTime?: number;
  /** De-duplicates rows when new records shift the offsets between page loads. */
  readonly getId: (row: T) => string;
  /** Keep the previous filter's rows on screen while a new filter loads. */
  readonly keepPrevious?: boolean;
}

/**
 * An infinite list that behaves well offline and on a bad link.
 *
 * - Pages load as the user scrolls (`loadMore` from FlatList.onEndReached).
 * - Every loaded page lives in the persisted query cache (AsyncStorage), so the
 *   list is readable offline exactly as far as it was scrolled — and opens
 *   instantly next launch.
 * - With cached pages present, a refresh runs in the background: `rows` keeps
 *   the last known list and `isInitialLoading` stays false, so screens show a
 *   spinner only when there is genuinely nothing to show yet.
 * - Offline, React Query pauses instead of firing doomed requests
 *   (onlineManager is bridged to NetInfo in lib/connectivity.ts); it resumes
 *   on reconnect.
 */
export function usePagedList<T>({
  queryKey,
  fetchPage,
  enabled = true,
  staleTime = 30_000,
  getId,
  keepPrevious = false,
}: Options<T>) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPageParam<T>,
    enabled,
    staleTime,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of q.data?.pages ?? []) {
      for (const row of page.rows) {
        const id = getId(row);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(row);
      }
    }
    return out;
    // getId is a stable accessor at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const loadMore = (): void => {
    if (q.hasNextPage && !q.isFetchingNextPage && !q.isFetching) void q.fetchNextPage();
  };

  return {
    rows,
    total: q.data?.pages[0]?.total ?? 0,
    firstPageExtra: q.data?.pages[0]?.extra,
    /** Nothing cached and the first page is on its way — the only time to show a spinner. */
    isInitialLoading: q.isPending && q.fetchStatus === 'fetching',
    /** Pull-to-refresh indicator: a user-visible refresh, not page loads. */
    isRefreshing: q.isRefetching && !q.isFetchingNextPage,
    isFetchingNextPage: q.isFetchingNextPage,
    hasNextPage: !!q.hasNextPage,
    /** Paused because the device is offline (cached rows still shown). */
    isPaused: q.fetchStatus === 'paused',
    loadMore,
    refetch: q.refetch,
  };
}
