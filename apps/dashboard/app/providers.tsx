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
        // ON. With no push or socket channel, refetching when the tab regains
        // focus is the main way the owner learns about things that happened
        // elsewhere — a mini confirming a consignment, a handover submitted.
        //
        // This was briefly off to avoid a resume burst, but "the screen is
        // stale until I log out and back in" is a far worse failure than a
        // burst of cheap requests. staleTime (30s) keeps it from refetching
        // anything just loaded, so rapid tab-switching costs nothing.
        refetchOnWindowFocus: true,
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
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  );
}
