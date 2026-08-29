'use client';

import { useMemo } from 'react';
import { useAuthStore } from '../store/auth.store';
import { usePersonaStore } from '../store/persona.store';

/**
 * Which services the current user may use, right now.
 *
 * Two things decide it:
 *  1. The persona. Acting as "self" means operating on your OWN books, where you
 *     are the owner and hold everything — the employer's role only binds while
 *     the persona is "employer". This mirrors `X-Acting-As` in the API guard.
 *  2. The role attached to the active employment. `services` arrives from
 *     `/auth/me` already expanded (implied reads included) and trimmed to the
 *     employee's tier, so this is a plain membership test.
 *
 * An employee with no role assigned gets an EMPTY list from the API: nothing is
 * handed out by default. `hasNoAccess` below distinguishes that from being
 * unrestricted, so the UI can send them somewhere that explains it.
 *
 * THIS IS NOT THE SECURITY BOUNDARY. The API enforces the identical set on every
 * request; hiding a control here is a convenience so people are not shown doors
 * that will not open. Never rely on it to protect data.
 */
export interface Permissions {
  /** True when the user holds the service (or is unrestricted). */
  can: (service: string) => boolean;
  /** True when the user holds at least one of these. */
  canAny: (...services: string[]) => boolean;
  /** True when no role restricts this session (owner, or acting as self). */
  unrestricted: boolean;
  /**
   * True when this is an employee whose employer has opened nothing for them —
   * a restricted session holding zero services. Distinct from `!unrestricted`,
   * which is also true for an employee who does have some access.
   */
  hasNoAccess: boolean;
  /** Name of the role in force, for display. Null when unrestricted. */
  roleName: string | null;
}

export function usePermissions(): Permissions {
  const user = useAuthStore((s) => s.user);
  const personaKind = usePersonaStore((s) => s.kind);

  return useMemo(() => {
    const employment = user?.activeEmployment;
    const bound = personaKind === 'employer' && !!employment;
    const services = bound ? employment?.services : undefined;

    // `undefined` means we are not restricted at all: no employment, acting as
    // self, or a server that predates the services field. An EMPTY array is very
    // different — an employee who has been given nothing — so it must never
    // collapse into "allow".
    if (!services) {
      return {
        can: () => true,
        canAny: () => true,
        unrestricted: true,
        hasNoAccess: false,
        roleName: null,
      };
    }

    const set = new Set(services);
    return {
      can: (service: string) => set.has(service),
      canAny: (...list: string[]) => list.some((s) => set.has(s)),
      unrestricted: false,
      hasNoAccess: set.size === 0,
      roleName: employment?.role?.name ?? null,
    };
  }, [user?.activeEmployment, personaKind]);
}
