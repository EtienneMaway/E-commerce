/**
 * Which catalogue service each dashboard route needs.
 *
 * Shared by the sidebar (to hide entries) and by `RequireService` (to guard the
 * page itself), so typing a URL cannot reach a page the nav is hiding.
 *
 * `null` marks a route that is always available: identity, own salary, and the
 * employment relationship itself must never be lockable — an employee has to be
 * able to see what they are owed and to leave the job.
 *
 * An array means any-of, matching `@RequiresService` on the API side.
 */
export const NAV_SERVICE: Record<string, string | string[] | null> = {
  '/dashboard': 'cash.overview',
  '/inventory': 'inventory.view',
  '/inventory/movements': 'inventory.movements',
  '/suppliers': 'suppliers.view',
  '/debtors': 'debtors.view',
  '/sales': 'sales.history',
  '/sales/top-products': 'sales.analytics',
  '/consignments': ['consignments.send', 'consignments.receive'],
  '/external-contacts': 'external_contacts.view',
  '/expenses': 'expenses.view',
  '/activity': 'activity.log',
  '/withdrawals': 'withdrawals',
  // A supervisor with handovers.approve reaches mini oversight through here;
  // the hiring and payroll panels inside are gated separately.
  '/employees': ['employees.manage', 'handovers.approve'],
  // Longest-prefix match means this beats '/employees' — role admin stays owner-side.
  '/employees/roles': 'employees.manage',
  '/pricing': 'pricing.catalog',
  '/my-salary': null,
  '/settings': null,
  // Where a role-less employee lands; must never be gated or it would loop.
  '/no-access': null,
};

/**
 * Where to send someone who lands on a page they may not open. Ordered by how
 * useful the landing is; `/my-salary` is last because every employee can reach
 * it, which makes it a terminal fallback that cannot loop.
 */
export const FALLBACK_ORDER: readonly string[] = [
  '/dashboard',
  '/sales',
  '/inventory',
  '/expenses',
  '/consignments',
  '/my-salary',
];

/**
 * The service a pathname needs, by longest-prefix match — so `/suppliers/[id]`
 * inherits `/suppliers`, and `/inventory/movements` beats `/inventory` because
 * it is longer. Returns undefined for a route the map says nothing about, which
 * is treated as "always allowed".
 */
export function serviceForPath(pathname: string): string | string[] | null | undefined {
  let best: string | undefined;
  for (const href of Object.keys(NAV_SERVICE)) {
    if (pathname === href || pathname.startsWith(href + '/')) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best === undefined ? undefined : NAV_SERVICE[best];
}
