import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SIGNAL_POLL_MS,
  fetchInboxSignal,
  initInboxSignal,
  resetInboxSignal,
} from '../lib/inbox-signal';
import { useAuthStore } from '../store/auth.store';

/**
 * Mount once, at the app root. Installs the `X-Inbox-Signal` response reader and
 * runs the slow idle poll that backs it up.
 *
 * Everything else is automatic: `applySignal` invalidates the affected React
 * Query keys, and the screens holding those queries refetch themselves. No
 * screen needs to know this exists — which is the point, since the four
 * `refetchInterval`s this replaces were scattered across three files.
 */
export function useInboxSignal(): void {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  // Install the response interceptor for the lifetime of the app.
  useEffect(() => initInboxSignal(queryClient), [queryClient]);

  // Stamps are per-user high-water marks. Clearing them whenever the token
  // changes (login, logout, account switch) stops one user's marks from
  // suppressing the next user's first invalidation.
  useEffect(() => resetInboxSignal(), [token]);

  useQuery({
    queryKey: ['sync', 'signal'],
    queryFn: async () => {
      await fetchInboxSignal();
      // The value is applied as a side effect; React Query only needs
      // something non-undefined to consider the query resolved.
      return null;
    },
    enabled: !!token,
    // Always refetch when asked — a cached signal is worthless, the whole point
    // is finding out whether something changed since the last look.
    staleTime: 0,
    refetchInterval: SIGNAL_POLL_MS,
    // Inherited defaults do the rest: paused while offline (onlineManager) and
    // while backgrounded, and refetched on foreground and on reconnect —
    // exactly the catch-up behaviour the old per-channel polls relied on.
  });
}
