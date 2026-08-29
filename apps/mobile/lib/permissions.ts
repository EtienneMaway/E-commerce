import { useMemo } from 'react';
import { useAuthStore } from '../store/auth.store';
import { usePersonaStore } from '../store/persona.store';

/**
 * Which services the current user may use, right now.
 *
 * Mirrors the dashboard hook and, more importantly, the API guard:
 *  1. Persona. Acting as "self" means operating on your OWN books, where you
 *     hold everything — the employer's role only binds while acting for them.
 *  2. The role on the active employment. `services` arrives from `/auth/me`
 *     already expanded (implied reads included) and trimmed to the employee's
 *     tier, so this is a plain membership test.
 *
 * Works offline: the list is cached with the profile in the auth store.
 *
 * THIS IS NOT THE SECURITY BOUNDARY. The API enforces the identical set on
 * every request; hiding a control here just avoids showing doors that will not
 * open.
 */
export interface Permissions {
  can: (service: string) => boolean;
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

    // `undefined` = not restricted at all (no employment, acting as self, or a
    // server older than this field). An EMPTY array is different — an employee
    // who has been given nothing — and must never collapse into "allow".
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
