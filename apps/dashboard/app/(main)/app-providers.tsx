'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isAuthError } from '../../lib/utils';
import { useInboxSignal } from '../../hooks/use-inbox-signal';

/**
 * React Query, scoped to the authenticated app.
 *
 * This used to live in the root layout, which meant the public pages — the
 * landing page, /login, /register, /privacy — all shipped the query client, the
 * axios-backed api layer and the inbox-signal hook to visitors who could not
 * possibly use them. On the landing page that was most of the JavaScript on a
 * page that needs none. Nothing outside `(main)` calls `useQuery`, so the
 * provider belongs here.
 */
function InboxSignal() {
  useInboxSignal();
  return null;
}

/**
 * Clears the "I meant to browse the public site" flag.
 *
 * `Landing.tsx` sets it in sessionStorage when someone follows the dashboard's
 * "Visit website" link, so moving between `/` and `/fr` does not bounce them
 * back here. Landing on any app route means they are done looking, and the next
 * bare visit to `/` should behave normally — go straight to the books.
 */
function ClearSiteIntent() {
  useEffect(() => {
    try {
      sessionStorage.removeItem('kmb_site');
    } catch {
      /* private mode / storage disabled — nothing to clear */
    }
  }, []);
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Tuned for merchants on 2G/3G links, where every avoidable request costs
  // seconds. See lib/utils.isAuthError / isNetworkError for the retry policy.
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Cache survives 30 min instead of the 5 min default, so navigating
        // back to a page after a break serves from memory instead of refetching
        // the whole screen.
        gcTime: 30 * 60_000,
        // Three attempts with backoff — one retry is not enough on a flaky
        // link. Never retry a 401/403: the answer will not change, and retrying
        // just delays the redirect to login.
        retry: (failureCount, err) => !isAuthError(err) && failureCount < 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
        // OFF. The dashboard mounts many queries; with this on, tabbing back
        // after 30s+ refires all of them at once, and on the 2G/3G links these
        // merchants use that burst reads as "loading for ages". Inbox freshness
        // (handovers, consignments, invites) is now delivered precisely by the
        // inbox-signal poll + header (see lib/inbox-signal.ts), so the blunt
        // refetch-everything-on-focus is no longer needed to stay current.
        refetchOnWindowFocus: false,
        // Reconnect stays ON: regaining a connection after an outage should pull
        // whatever was missed. It fires far less often than focus and only when
        // there is genuinely new ground to catch up on.
        refetchOnReconnect: true,
      },
      mutations: {
        // Writes are not idempotent here (no client-side dedupe key on the web
        // client), so they must NOT auto-retry — a retried POST could double-
        // record a payment or sale. Surface the error and let the user decide.
        retry: 0,
      },
    },
  }));
  return (
    <QueryClientProvider client={qc}>
      <InboxSignal />
      <ClearSiteIntent />
      {children}
    </QueryClientProvider>
  );
}
