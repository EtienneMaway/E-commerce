'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme.store';
import { useLocaleStore } from '../store/locale.store';
import { isAuthError } from '../lib/utils';

function AppProvider({ children }: { children: React.ReactNode }) {
  const initTheme = useThemeStore((s) => s.init);
  const initLocale = useLocaleStore((s) => s.init);
  useEffect(() => {
    initTheme();
    initLocale();
  }, [initTheme, initLocale]);
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
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
        // OFF deliberately. The dashboard page mounts 7 queries; with this on,
        // every alt-tab back to the browser refired all of them at once. On a
        // slow connection that burst is worse than slightly stale data.
        refetchOnWindowFocus: false,
        // Also off: a flapping connection would otherwise trigger the same
        // full-screen burst each time it briefly reconnects.
        refetchOnReconnect: false,
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
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  );
}
