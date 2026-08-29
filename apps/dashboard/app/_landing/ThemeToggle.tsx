'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '../../store/theme.store';
import styles from './landing.module.css';

/**
 * Light/dark switch for the public pages.
 *
 * The only client component on the landing page, and deliberately the smallest
 * thing that can do the job: it drives the same `theme.store` the dashboard
 * uses, so a choice made here is the one the merchant finds after signing in.
 *
 * It renders nothing until mounted. The stored preference lives in
 * localStorage, which the server cannot see, so rendering a sun or a moon
 * during SSR would be a coin flip and hydration would tear. The blocking script
 * in `app/layout.tsx` has already applied the correct theme by this point — the
 * page is never briefly wrong, only this one control is briefly absent.
 */
export function ThemeToggle({ label }: { label: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reserve the space so the header does not shift when the icon appears.
  if (!mounted) return <span className={styles.themeBtnPlaceholder} aria-hidden="true" />;

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className={styles.themeBtn}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1Z" />
        </svg>
      )}
    </button>
  );
}
