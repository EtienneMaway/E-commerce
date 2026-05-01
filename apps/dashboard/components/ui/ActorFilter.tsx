'use client';

import { useQuery } from '@tanstack/react-query';
import { Employment, employmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useAuthStore } from '../../store/auth.store';

export const ACTOR_FILTER_ALL = '__all__';

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
 *  - One option per current/past employee from /employments?role=employer
 *
 * Returns sentinel ACTOR_FILTER_ALL or an employee user id; callers translate
 * via resolveActorFilter() before passing to the API.
 *
 * NOTE: there is no "owner-only" filter — owner-performed rows have actor_id NULL,
 * which the actor column on each row already makes visible.
 */
export function ActorFilter({ value, onChange, className }: ActorFilterProps) {
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
      <option value={ACTOR_FILTER_ALL}>All actors</option>
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
