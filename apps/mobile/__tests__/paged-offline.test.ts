import { QueryClient, onlineManager, dehydrate, hydrate, InfiniteQueryObserver } from '@tanstack/react-query';
import { nextPageParam, fromPaginated, MOBILE_PAGE_SIZE, type PageResult } from '../lib/paged-list';

/**
 * The infinite lists' offline / bad-network behaviour, with the real React
 * Query engine (no UI): pages load in order and stop at the end; loaded pages
 * survive an app restart via the persisted cache; offline, cached rows stay
 * and fetches pause instead of failing; reconnecting refreshes in the
 * background without ever blanking the list.
 */

interface Row {
  id: string;
}

const TOTAL = 45; // 20 + 20 + 5
let serverRows: Row[] = [];
let calls = 0;
let latencyMs = 0;

async function fetchPage(page: number): Promise<PageResult<Row>> {
  calls += 1;
  if (!onlineManager.isOnline()) throw new Error('network down'); // never reached when paused
  if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
  const start = (page - 1) * MOBILE_PAGE_SIZE;
  return fromPaginated({
    data: serverRows.slice(start, start + MOBILE_PAGE_SIZE),
    pagination: { total: serverRows.length },
  });
}

const KEY = ['sales', 'history', { period: '30d', pages: true }];

/** A client wired like the app's: PersistQueryClientProvider mounts it, which
 * subscribes it to onlineManager so paused fetches resume on reconnect. */
function newClient(): QueryClient {
  const qc = new QueryClient();
  qc.mount();
  return qc;
}

function observe(qc: QueryClient) {
  return new InfiniteQueryObserver(qc, {
    queryKey: KEY,
    queryFn: ({ pageParam }) => fetchPage(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
    staleTime: 30_000,
  });
}

const rowsOf = (data: { pages: PageResult<Row>[] } | undefined): string[] =>
  (data?.pages ?? []).flatMap((p) => p.rows.map((r) => r.id));

beforeEach(() => {
  serverRows = Array.from({ length: TOTAL }, (_, i) => ({ id: `s${i + 1}` }));
  calls = 0;
  latencyMs = 0;
  onlineManager.setOnline(true);
});

afterAll(() => onlineManager.setOnline(true));

test('pages load in order and stop at the end', async () => {
  const qc = newClient();
  const obs = observe(qc);
  const unsub = obs.subscribe(() => undefined);
  await obs.refetch();
  expect(rowsOf(obs.getCurrentResult().data)).toHaveLength(20);
  expect(obs.getCurrentResult().hasNextPage).toBe(true);
  await obs.fetchNextPage();
  await obs.fetchNextPage();
  const r = obs.getCurrentResult();
  expect(rowsOf(r.data)).toEqual(serverRows.map((x) => x.id));
  expect(r.hasNextPage).toBe(false);
  unsub();
  qc.clear();
  qc.unmount();
});

test('loaded pages survive a restart (persist → restore) and read offline', async () => {
  // Session 1: online, scroll two pages.
  const before = newClient();
  const obs1 = observe(before);
  const unsub1 = obs1.subscribe(() => undefined);
  await obs1.refetch();
  await obs1.fetchNextPage();
  unsub1();
  // What the AsyncStorage persister writes: dehydrated successful queries, as JSON.
  const saved = JSON.stringify(
    dehydrate(before, { shouldDehydrateQuery: (q) => q.state.status === 'success' }),
  );
  before.clear();
  before.unmount();

  // Session 2: the phone restarts with no signal.
  onlineManager.setOnline(false);
  calls = 0;
  const after = newClient();
  hydrate(after, JSON.parse(saved));
  const obs2 = observe(after);
  const unsub2 = obs2.subscribe(() => undefined);
  const r = obs2.getCurrentResult();
  expect(rowsOf(r.data)).toHaveLength(40); // both scrolled pages, instantly
  expect(r.isPending).toBe(false); // nothing to spin over
  // The stale cache would normally refetch — offline it pauses instead of failing.
  void obs2.refetch();
  await new Promise((res) => setTimeout(res, 20));
  expect(obs2.getCurrentResult().fetchStatus).toBe('paused');
  expect(obs2.getCurrentResult().isError).toBe(false);
  expect(calls).toBe(0); // not one doomed request
  expect(rowsOf(obs2.getCurrentResult().data)).toHaveLength(40);
  unsub2();
  after.clear();
  after.unmount();
});

test('on a slow link, cached rows stay visible while the refresh runs behind', async () => {
  const qc = newClient();
  const obs = observe(qc);
  const unsub = obs.subscribe(() => undefined);
  await obs.refetch();
  // A new sale arrives server-side; the link is now slow.
  serverRows = [{ id: 'new' }, ...serverRows];
  latencyMs = 150;
  const pending = obs.refetch();
  await new Promise((res) => setTimeout(res, 20));
  const during = obs.getCurrentResult();
  expect(during.isFetching).toBe(true);
  expect(during.isPending).toBe(false); // the screen keeps its list…
  expect(rowsOf(during.data)[0]).toBe('s1'); // …the old one, until the new one lands
  await pending;
  expect(rowsOf(obs.getCurrentResult().data)[0]).toBe('new');
  unsub();
  qc.clear();
  qc.unmount();
});

test('reconnecting resumes the paused refresh', async () => {
  const qc = newClient();
  const obs = observe(qc);
  const unsub = obs.subscribe(() => undefined);
  await obs.refetch();
  onlineManager.setOnline(false);
  serverRows = [{ id: 'while-offline' }, ...serverRows];
  void obs.refetch();
  await new Promise((res) => setTimeout(res, 20));
  expect(obs.getCurrentResult().fetchStatus).toBe('paused');
  onlineManager.setOnline(true);
  await new Promise((res) => setTimeout(res, 50));
  expect(rowsOf(obs.getCurrentResult().data)[0]).toBe('while-offline');
  unsub();
  qc.clear();
  qc.unmount();
});
