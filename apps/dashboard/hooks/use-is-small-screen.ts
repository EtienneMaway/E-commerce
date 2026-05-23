'use client';

import { useEffect, useState } from 'react';

const SMALL_SCREEN_QUERY = '(max-width: 639px)';

/**
 * Returns true when the viewport is narrower than Tailwind's `sm` breakpoint
 * (640px). SSR-safe: initial render assumes a wide screen and re-renders once
 * the media query resolves on the client, which keeps server markup stable.
 */
export function useIsSmallScreen(): boolean {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(SMALL_SCREEN_QUERY);
    setIsSmall(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isSmall;
}
