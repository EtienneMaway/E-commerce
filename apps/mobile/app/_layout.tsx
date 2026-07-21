import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, router, useNavigationContainerRef, useSegments } from 'expo-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import { useLocaleStore } from '../store/locale.store';
import { usePersonaStore } from '../store/persona.store';
import { usePrinterStore } from '../store/printer.store';
import { useT } from '../lib/i18n';
import { authApi, dashboardApi } from '../lib/api';
import { isAuthError } from '../lib/utils';
import { initConnectivity } from '../lib/connectivity';
import { useInboxSignal } from '../hooks/use-inbox-signal';
import { scheduleAlertNotifications } from '../lib/notifications';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

// Tuned for merchants on 2G/edge links in DRC. lib/sync.ts already established
// that one attempt on a 10s budget is not enough on these networks; these
// defaults bring the same thinking to ordinary reads.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Three attempts with backoff instead of one. Never retry a 401/403 —
      // the answer will not change and it only delays the error.
      retry: (failureCount, err) => !isAuthError(err) && failureCount < 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      // Hold cached screens for 24h rather than the 5min default. Backgrounding
      // the app for a few minutes previously evicted everything, so returning
      // to it triggered a full refetch storm before anything could render.
      gcTime: 24 * 60 * 60_000,
      // Refetch when the app returns to the foreground (bridged from AppState
      // in lib/connectivity.ts). For inbox events specifically — a consignment
      // sent to you, an employment invite — lib/inbox-signal.ts now drives the
      // refresh; this remains the general freshness net for everything else.
      //
      // It was briefly disabled to avoid a resume burst, back when the home tab
      // fired 7-8 requests. That tab is now a single aggregate call
      // (GET /dashboard/home), so the burst is small and freshness wins.
      // staleTime (30s) still prevents refetching anything just loaded.
      refetchOnWindowFocus: true,
      // Same reasoning: regaining signal should pull whatever was missed.
      refetchOnReconnect: true,
    },
    mutations: {
      // Only the sale path carries a client-side idempotency key
      // (RecordSaleModal's clientSaleId). Everything else would risk double-
      // writing on retry, so failures surface to the user instead.
      retry: 0,
    },
  },
});

/**
 * Writes the query cache to AsyncStorage so it survives an app restart.
 *
 * Before this, the cache was purely in-memory: every cold start showed empty
 * skeletons and fired a 7-8 request fan-out, even when the merchant had opened
 * the same screen a minute earlier. On a 2G link that made the app unusable for
 * the first 10-30 seconds of every launch. Now the last known data paints
 * immediately and refetches quietly in the background.
 */
const persistOptions = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'rq-cache',
    // Sales/money data goes stale but never becomes dangerous to show briefly;
    // a week keeps a merchant who opens the app rarely from a cold blank start.
    throttleTime: 2_000,
  }),
  maxAge: 7 * 24 * 60 * 60_000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { status: string } }) =>
      // Never persist errored queries — a failure captured on a bad network
      // would otherwise be restored as the "known" state on next launch.
      query.state.status === 'success',
  },
};

function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    useThemeStore.getState().init();
  }, []);

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  return null;
}

function LocaleSync() {
  useEffect(() => {
    useLocaleStore.getState().init();
  }, []);
  return null;
}

function AuthGuard() {
  const { token, isLoading, login, logout } = useAuthStore();
  const segments = useSegments();
  const navigationRef = useNavigationContainerRef();
  const [isNavReady, setIsNavReady] = useState(false);

  useEffect(() => {
    useAuthStore.getState().hydrate();
    // Persona must hydrate before any request leaves, so the X-Acting-As
    // header reflects the persisted choice from the previous session.
    void usePersonaStore.getState().hydrate();
    // Restore the paired Bluetooth printer so the first sale of the session
    // can print directly without an explicit re-pair.
    void usePrinterStore.getState().hydrate();
  }, []);

  // useRootNavigationState is deprecated in Expo Router 55 and throws from root layout.
  // useNavigationContainerRef + addListener is the correct replacement.
  useEffect(() => {
    if (navigationRef.isReady()) {
      setIsNavReady(true);
      return;
    }
    const unsubscribe = navigationRef.addListener('state', () => {
      setIsNavReady(true);
    });
    return unsubscribe;
  }, [navigationRef]);

  useEffect(() => {
    if (!isNavReady || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      // Validate token is still good then go to tabs.
      // Awaiting login() matters: it resolves the persona (Self/Employer) so
      // the very next API call from the home tab carries the right
      // X-Acting-As header. Without the await, queries can fire before
      // persona is applied and momentarily return the wrong "books".
      authApi.me()
        .then(async (user) => {
          await useAuthStore.getState().login(token, user);
          router.replace('/(tabs)');
          // Schedule alert notifications after confirmed auth
          dashboardApi.alerts()
            .then((alerts) => scheduleAlertNotifications(alerts))
            .catch(() => {/* non-critical — ignore */});
        })
        .catch((err: unknown) => {
          // Only a real rejection of the token ends the session. Previously ANY
          // failure logged the user out — so opening the app on a weak signal
          // (a 10s timeout back then) kicked the merchant to the login screen
          // with a perfectly valid token.
          if (isAuthError(err)) {
            logout().then(() => router.replace('/(auth)/login'));
            return;
          }
          // Network failure: keep the session and let them into the app. Cached
          // screens still render, and queued sales still sync when signal
          // returns.
          router.replace('/(tabs)');
        });
    }
  }, [token, isLoading, segments, isNavReady]);

  return null;
}

/**
 * Server-driven inbox refresh. Must live inside the QueryClientProvider (it
 * needs useQueryClient) — hence a component rather than a call in RootLayout.
 */
function InboxSignalSync() {
  useInboxSignal();
  return null;
}

function DynamicStatusBar() {
  const theme = useThemeStore((s) => s.theme);
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const t = useT();

  // Bridge NetInfo + AppState into React Query and auto-drain the offline
  // queue. Without this the app had no idea it had lost or regained signal.
  useEffect(() => initConnectivity(), []);

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeSync />
        <LocaleSync />
        <AuthGuard />
        <InboxSignalSync />
        <DynamicStatusBar />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="supplier/[id]"
            options={{ headerShown: true, title: t.screens.supplierDetail, headerBackTitle: t.screens.back }}
          />
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen
            name="expenses"
            options={{ headerShown: true, title: t.expenses.title, headerBackTitle: t.screens.back }}
          />
          <Stack.Screen
            name="handovers"
            options={{ headerShown: true, title: t.miniEmployee.historyTitle, headerBackTitle: t.screens.back }}
          />
        </Stack>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
