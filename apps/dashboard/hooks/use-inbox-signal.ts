'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { QK } from '../lib/query-keys';
import {
  SIGNAL_POLL_MS,
  fetchInboxSignal,
  initInboxSignal,
  resetInboxSignal,
} from '../lib/inbox-signal';

/**
 * Mount once, high in the tree. Installs the `X-Inbox-Signal` response reader
 * and runs the slow idle poll that backs it up. Everything else is automatic:
 * a moved stamp invalidates the affected query keys and the screens holding
 * them refetch. No page needs to know this exists — which is why the explicit
 * `refetchInterval`s on the consignments and handover queries could be removed.
 */
export function useInboxSignal(): void {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  useEffect(() => initInboxSignal(queryClient), [queryClient]);

  // Per-user high-water marks: clear whenever the token changes (login, logout,
  // account switch) so one user's marks never suppress the next user's first
  // invalidation.
  useEffect(() => resetInboxSignal(), [token]);

  useQuery({
    queryKey: QK.syncSignal,
    queryFn: async () => {
      await fetchInboxSignal();
      // Applied as a side effect; React Query only needs a non-undefined value.
      return null;
    },
    enabled: !!token,
    // A cached signal is worthless — the point is to learn whether anything
    // changed since the last look.
    staleTime: 0,
    refetchInterval: SIGNAL_POLL_MS,
    // Cheap, and its whole purpose is freshness, so let it fire on focus too.
    refetchOnWindowFocus: true,
  });
}
