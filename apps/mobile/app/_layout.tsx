import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, router, useNavigationContainerRef, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import { useLocaleStore } from '../store/locale.store';
import { useT } from '../lib/i18n';
import { authApi, dashboardApi } from '../lib/api';
import { scheduleAlertNotifications } from '../lib/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

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
      // Validate token is still good then go to tabs
      authApi.me()
        .then((user) => {
          useAuthStore.getState().login(token, user);
          router.replace('/(tabs)');
          // Schedule alert notifications after confirmed auth
          dashboardApi.alerts()
            .then((alerts) => scheduleAlertNotifications(alerts))
            .catch(() => {/* non-critical — ignore */});
        })
        .catch(() => {
          logout().then(() => router.replace('/(auth)/login'));
        });
    }
  }, [token, isLoading, segments, isNavReady]);

  return null;
}

function DynamicStatusBar() {
  const theme = useThemeStore((s) => s.theme);
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const t = useT();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <LocaleSync />
      <AuthGuard />
      <DynamicStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="supplier/[id]"
          options={{ headerShown: true, title: t.screens.supplierDetail, headerBackTitle: t.screens.back }}
        />
        <Stack.Screen
          name="debtor/[id]"
          options={{ headerShown: true, title: t.screens.debtorDetail, headerBackTitle: t.screens.back }}
        />
        <Stack.Screen
          name="consignments"
          options={{ headerShown: true, title: t.screens.incomingConsignments, headerBackTitle: t.screens.back }}
        />
        <Stack.Screen
          name="external-contacts"
          options={{ headerShown: true, title: t.screens.externalContacts, headerBackTitle: t.screens.back }}
        />
        <Stack.Screen
          name="external-contact/[id]"
          options={{ headerShown: true, title: t.screens.externalContactDetail, headerBackTitle: t.screens.back }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
