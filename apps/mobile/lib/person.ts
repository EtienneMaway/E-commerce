/**
 * How to name a person who may have closed their account.
 *
 * Closing an account never deletes it: after the grace window the API keeps the
 * row (so sales, debts and handovers stay intact for everyone else) and blanks
 * the personal details, renaming it `deleted_user_<id>`. The app names the role
 * instead — "Former employee" where the person worked for the business, "Closed
 * account" where they were a trading counterparty. Mirrors the dashboard's
 * `lib/person.ts`.
 */

export interface PersonLike {
  username?: string | null;
  anonymizedAt?: string | null;
}

const ANONYMIZED_PREFIX = 'deleted_user_';

export function isClosedAccount(person: PersonLike | null | undefined): boolean {
  if (!person) return false;
  return !!person.anonymizedAt || (person.username ?? '').startsWith(ANONYMIZED_PREFIX);
}

/** `@username`, or `closedLabel` once the account was closed; `—` when unknown. */
export function personHandle(person: PersonLike | null | undefined, closedLabel: string): string {
  if (!person?.username) return '—';
  return isClosedAccount(person) ? closedLabel : `@${person.username}`;
}

/** Bare username (no `@`), or `closedLabel` once the account was closed. */
export function personName(person: PersonLike | null | undefined, closedLabel: string): string {
  if (!person?.username) return '—';
  return isClosedAccount(person) ? closedLabel : person.username;
}
