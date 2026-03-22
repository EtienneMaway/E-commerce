'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme.store';
import { useLocaleStore } from '../store/locale.store';

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
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  return (
    <QueryClientProvider client={qc}>
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  );
}
