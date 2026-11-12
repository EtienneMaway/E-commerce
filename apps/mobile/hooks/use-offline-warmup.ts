import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  branchTransfersApi,
  consignmentsApi,
  expensesApi,
  salesApi,
  type ExpenseListParams,
} from '../lib/api';
import { QK } from '../lib/query-keys';
import { fromDataTotal, fromPaginated, MOBILE_PAGE_SIZE, nextPageParam } from '../lib/paged-list';
import { usePermissions } from '../lib/permissions';
import { useAuthStore } from '../store/auth.store';
import { useShopStore } from '../store/shop.store';
import { usePersonaStore } from '../store/persona.store';
import { useOfflineStore } from '../store/offline.store';

/**
 * Pre-loads the first page of the main lists while the phone is online, so
 * they open offline even if the merchant never visited them this session —
 * and open instantly online, refreshing behind the cached copy.
 *
 * Polite on a 2G link:
 * - waits a few seconds after start/reconnect so the visible screen's own
 *   requests go first;
 * - one request at a time;
 * - `prefetch*` skips anything still fresh in the cache, so a list the user
 *   just opened costs nothing;
 * - at most once per 10 minutes per branch/persona, and never in manual
 *   offline mode.
 *
 * The keys and request parameters MUST match the screens' exactly (default
 * filters included), or the warm entry is never read. Screens: sales tab
 * (history, 30d), expenses (this month, page 1), handovers → Received (minis),
 * receive modal / mini home (pending consignments), branch transfers (incoming).
 */
const MIN_INTERVAL_MS = 10 * 60_000;
const START_DELAY_MS = 4_000;
/** Matches the sales tab's default history period. */
const SALES_DEFAULT_PERIOD = '30d';
/** Matches the expenses screen's default list params (filter "month", page 1). */
const EXPENSES_DEFAULT: ExpenseListParams = { page: 1, limit: 20, period: 'month' };

interface Plan {
  readonly sales: boolean;
  readonly expenses: boolean;
  readonly pendingConsignments: boolean;
  readonly consignmentHistory: boolean;
  readonly transfers: boolean;
}

async function warm(qc: QueryClient, plan: Plan): Promise<void> {
  const steps: (() => Promise<unknown>)[] = [];
  if (plan.sales) {
    const filters = { period: SALES_DEFAULT_PERIOD };
    steps.push(() =>
      qc.prefetchInfiniteQuery({
        queryKey: QK.salesHistoryPages(filters),
        queryFn: async ({ pageParam }) =>
          fromDataTotal(await salesApi.list({ ...filters, page: pageParam, limit: MOBILE_PAGE_SIZE })),
        initialPageParam: 1,
        getNextPageParam: nextPageParam,
        staleTime: 30_000,
      }),
    );
  }
  if (plan.pendingConsignments) {
    steps.push(() =>
      qc.prefetchQuery({ queryKey: QK.consignmentsPending, queryFn: consignmentsApi.incomingPending, staleTime: 15_000 }),
    );
  }
  if (plan.consignmentHistory) {
    steps.push(() =>
      qc.prefetchInfiniteQuery({
        queryKey: QK.consignmentsHistoryPages,
        queryFn: async ({ pageParam }) =>
          fromPaginated(await consignmentsApi.incomingPage(pageParam, MOBILE_PAGE_SIZE)),
        initialPageParam: 1,
        getNextPageParam: nextPageParam,
        staleTime: 15_000,
      }),
    );
  }
  if (plan.expenses) {
    steps.push(() =>
      qc.prefetchQuery({
        queryKey: QK.expenses(EXPENSES_DEFAULT),
        queryFn: () => expensesApi.list(EXPENSES_DEFAULT),
        staleTime: 30_000,
      }),
    );
  }
  if (plan.transfers) {
    steps.push(() =>
      qc.prefetchInfiniteQuery({
        queryKey: QK.branchTransferPages('incoming'),
        queryFn: async ({ pageParam }) =>
          fromPaginated(await branchTransfersApi.listPage('incoming', pageParam, MOBILE_PAGE_SIZE)),
        initialPageParam: 1,
        getNextPageParam: nextPageParam,
        staleTime: 30_000,
      }),
    );
  }
  for (const step of steps) {
    // Lost signal mid-way: stop; the next reconnect picks it up again.
    if (!onlineManager.isOnline() || useOfflineStore.getState().isOffline) return;
    // prefetch* never throws; a failed entry is simply not cached (or persisted).
    await step();
  }
}

export function useOfflineWarmup(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { can, canAny, unrestricted } = usePermissions();
  const shopCount = useShopStore((s) => s.shops.length);
  const ownsBusiness = useShopStore((s) => !!s.organization?.isOwner);
  const shopId = useShopStore((s) => s.selectedId);
  const persona = usePersonaStore((s) => s.kind);
  const lastRun = useRef<{ key: string; at: number } | null>(null);

  const isMini = user?.activeEmployment?.tier === 'SALES_ONLY';
  const plan: Plan = {
    sales: can('sales.history'),
    expenses: !isMini && canAny('expenses.view', 'expenses.record'),
    pendingConsignments: can('consignments.receive'),
    consignmentHistory: isMini && can('handovers.mini'),
    // Same rule as the home tile that opens the screen.
    transfers: (unrestricted && ownsBusiness && shopCount > 1) || (!unrestricted && can('custody.hold')),
  };
  const planKey = JSON.stringify(plan);
  // A different branch or persona is a different set of books: warm it anew.
  const runKey = `${user?.id ?? ''}|${shopId ?? ''}|${persona}|${planKey}`;

  useEffect(() => {
    if (!token || !user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (): void => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const now = Date.now();
        const last = lastRun.current;
        if (last && last.key === runKey && now - last.at < MIN_INTERVAL_MS) return;
        if (!onlineManager.isOnline() || useOfflineStore.getState().isOffline) return;
        if (AppState.currentState !== 'active') return;
        lastRun.current = { key: runKey, at: now };
        void warm(qc, JSON.parse(planKey) as Plan);
      }, START_DELAY_MS);
    };

    schedule();
    const unsubOnline = onlineManager.subscribe((online) => {
      if (online) schedule();
    });
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') schedule();
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubOnline();
      appSub.remove();
    };
  }, [qc, token, user, runKey, planKey]);
}
