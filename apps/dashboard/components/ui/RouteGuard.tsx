'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '../../lib/permissions';
import { FALLBACK_ORDER, NAV_SERVICE } from '../../lib/nav-services';
import { useToast } from './Toast';
import { useT } from '../../lib/i18n';

/**
 * Bounces the user off a page their role does not include, and says why.
 *
 * Rendered by the main layout rather than by each page: one implementation
 * covers every route, dynamic ones included. It lives inside ToastProvider
 * because the layout component itself sits outside that provider.
 *
 * The sidebar already hides these entries; this is for typed URLs, stale
 * bookmarks and shared links. Neither is the security boundary — the API refuses
 * the underlying requests either way.
 */
export function RouteGuard({ allowed }: { allowed: boolean }) {
  const { canAny, hasNoAccess } = usePermissions();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const handled = useRef(false);

  useEffect(() => {
    if (allowed) {
      // Re-arm, so a later navigation to another forbidden page is caught too.
      handled.current = false;
      return;
    }
    if (handled.current) return;
    handled.current = true;

    // An employee holding nothing has no useful page to fall back to, and a
    // "not permitted" toast on every navigation would just be noise. Send them
    // to the page that explains the situation instead.
    if (hasNoAccess) {
      router.replace('/no-access');
      return;
    }

    const target =
      FALLBACK_ORDER.find((href) => {
        const req = NAV_SERVICE[href];
        return req === null || canAny(...(Array.isArray(req) ? req : [req]));
      }) ?? '/my-salary';
    toast({
      title: t.roles.notPermittedTitle,
      description: t.roles.notPermittedBody,
      variant: 'error',
    });
    router.replace(target);
  }, [allowed, canAny, hasNoAccess, router, toast, t]);

  return null;
}
