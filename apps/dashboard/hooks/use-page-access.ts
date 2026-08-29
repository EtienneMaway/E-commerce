'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '../lib/permissions';

/**
 * Page-level guard for pages whose access is decided by granted services rather
 * than by "is this person the owner".
 *
 * Replaces `useOwnerOnlyPage` on pages that an employer can now delegate. The
 * old hook keyed off the persona alone, so it bounced anyone acting for an
 * employer — including someone the employer had explicitly granted the service.
 * That made a grantable service unreachable in the UI.
 *
 * `RouteGuard` in the main layout already redirects on the same rule; this is the
 * per-page half that also gates the page's own queries, so they don't fire while
 * the redirect is in flight.
 */
export function usePageAccess(...services: string[]): boolean {
  const { canAny } = usePermissions();
  const router = useRouter();
  const allowed = canAny(...services);

  useEffect(() => {
    if (!allowed) router.replace('/dashboard');
  }, [allowed, router]);

  return allowed;
}
