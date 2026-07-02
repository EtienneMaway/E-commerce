'use client';

import { useQuery } from '@tanstack/react-query';
import { Employment, employmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useAuthStore } from '../../store/auth.store';
import { useT } from '../../lib/i18n';

export const ACTOR_FILTER_ALL = '__all__';
/**
 * Sentinel for "only my own rows". Sent to the API verbatim as `actorId=self`;
 * the backend resolves it viewer-relative (owner → actor_id IS NULL, employee →
 * their own id). Not a UUID, so it never collides with an employee option.
 */
export const ACTOR_FILTER_SELF = 'self';

interface ActorFilterProps {
  value: string; // ACTOR_FILTER_ALL | employee user id
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Dropdown to filter list views by actor (the employee who performed an action).
 *
 * Options:
 *  - "All actors" — no filter
 *  - "Self" — only the current viewer's own rows (ACTOR_FILTER_SELF)
 *  - One option per current/past employee from /employments?role=employer
 *
 * Returns sentinel ACTOR_FILTER_ALL / ACTOR_FILTER_SELF or an employee user id;
 * callers translate via resolveActorFilter() before passing to the API.
 */
export function ActorFilter({ value, onChange, className }: ActorFilterProps) {
  const t = useT();
  const { user } = useAuthStore();
  const { data } = useQuery({
    queryKey: QK.employments({ role: 'employer' }),
    queryFn: () => employmentsApi.list({ role: 'employer' }),
    staleTime: 60_000,
  });

  const employees = ((data as Employment[] | undefined) ?? [])
    .filter((e) => e.employerId === user?.id)
    .map((e) => e.employee)
    .filter((u): u is NonNullable<Employment['employee']> => Boolean(u));

  // De-dup by id (a user might appear in multiple employments over time).
  const seen = new Set<string>();
  const unique = employees.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-2 py-1 rounded-md border bg-transparent text-sm ${className ?? ''}`}
      style={{ borderColor: 'rgba(127,127,127,0.3)' }}
    >
      <option value={ACTOR_FILTER_ALL}>{t.activity.filterActorAll}</option>
      <option value={ACTOR_FILTER_SELF}>{t.activity.filterActorSelf}</option>
      {unique.map((u) => (
        <option key={u.id} value={u.id}>
          {u.username}
          {u.isMiniEmployee ? ' (mini)' : ''}
        </option>
      ))}
    </select>
  );
}

export function resolveActorFilter(value: string): string | undefined {
  return value === ACTOR_FILTER_ALL ? undefined : value;
}
