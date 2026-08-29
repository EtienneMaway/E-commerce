import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { usePermissions } from '../lib/permissions';

/**
 * Bounce off a screen the current role does not include.
 *
 * Tabs are hidden with `href: null`, which also makes them unreachable — this is
 * for the standalone screens that are pushed from somewhere else (a deep link, a
 * stale back-stack entry, a tile that shipped before the role changed).
 *
 * Returns whether the screen may render. Most callers ignore it and rely on the
 * redirect — bailing out early would skip the hooks below it and break the rules
 * of hooks. Use the return value only to feed `enabled:` on a query.
 */
export function useRequireService(...services: string[]): boolean {
  const { canAny } = usePermissions();
  const allowed = canAny(...services);
  const bounced = useRef(false);

  useEffect(() => {
    if (allowed) {
      bounced.current = false;
      return;
    }
    if (bounced.current) return;
    bounced.current = true;
    // back() would land on whatever pushed this screen, which may be the same
    // forbidden route; home is always reachable.
    router.replace('/(tabs)');
  }, [allowed]);

  return allowed;
}
