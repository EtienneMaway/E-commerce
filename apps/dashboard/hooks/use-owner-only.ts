'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePersonaStore } from '../store/persona.store';

/**
 * Page-level guard: redirects to /dashboard whenever the user is acting in
 * Employer mode. Sidebar already hides owner-only entries; this closes the
 * direct-URL gap so an employee can't change pricing or settings by navigating
 * to the path manually while in Employer mode.
 *
 * Drop into pages: Pricing, Employees, Withdrawals, Settings.
 */
export function useOwnerOnlyPage() {
  const router = useRouter();
  const kind = usePersonaStore((s) => s.kind);

  useEffect(() => {
    if (kind === 'employer') router.replace('/dashboard');
  }, [kind, router]);

  return kind === 'self';
}
