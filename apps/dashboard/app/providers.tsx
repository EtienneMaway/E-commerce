'use client';

import { useEffect } from 'react';
import { useThemeStore } from '../store/theme.store';
import { useLocaleStore } from '../store/locale.store';

/**
 * Root providers — deliberately tiny.
 *
 * Only the two zustand stores every page needs: theme (which toggles `.dark` on
 * <html>, so the public pages follow the reader's preference) and locale.
 * React Query moved to `app/(main)/app-providers.tsx`; see the note there for
 * why a marketing page should not carry it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const initTheme = useThemeStore((s) => s.init);
  const initLocale = useLocaleStore((s) => s.init);
  useEffect(() => {
    initTheme();
    initLocale();
  }, [initTheme, initLocale]);
  return <>{children}</>;
}
