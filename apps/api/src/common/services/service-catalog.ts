import { ActorTier } from '../types/actor-context';

/**
 * The catalogue of grantable "services" — the feature areas an employer can open
 * or close for an employee via an EmployeeRole.
 *
 * Three rules govern the whole mechanism (see EMPLOYEE_ROLES_PLAN.md):
 *
 *  1. The actor tier is the CEILING, a role only NARROWS it. `@AllowedFor` runs
 *     first in JwtAuthGuard, so granting `withdrawals` to a mini still 403s. No
 *     role configuration can escalate privilege.
 *  2. An employee holds EXACTLY what their role grants — nothing is handed out
 *     by default. No role assigned means no services at all: they can still sign
 *     in, see their own salary and leave the job (the always-on core), but every
 *     feature area is closed until the employer opens it.
 *  3. A user with no active employment (OWNER), including a full employee who
 *     switched to `X-Acting-As: self`, always holds every service on their own
 *     books. Roles bind only while acting for the employer.
 *
 * Routes carry `@RequiresService(...)`. Routes without it are the always-on core:
 * identity, own salary, and the employment lifecycle itself — an employee must
 * never be locked out of quitting the job.
 */
export type ServiceGroup = 'SALES' | 'STOCK' | 'NETWORK' | 'MONEY' | 'PEOPLE';

export const SERVICE_GROUPS: readonly ServiceGroup[] = [
  'SALES',
  'STOCK',
  'NETWORK',
  'MONEY',
  'PEOPLE',
] as const;

export type ServiceKey =
  // SALES
  | 'sales.record'
  | 'sales.history'
  | 'sales.analytics'
  // STOCK
  | 'inventory.view'
  | 'inventory.receive'
  | 'inventory.add_personal'
  | 'inventory.adjust'
  | 'inventory.price'
  | 'products.manage'
  | 'pricing.catalog'
  | 'inventory.movements'
  // NETWORK
  | 'suppliers.view'
  | 'suppliers.pay'
  | 'debtors.view'
  | 'debtors.collect'
  | 'consignments.send'
  | 'consignments.receive'
  | 'external_contacts.view'
  | 'external_contacts.manage'
  | 'external_contacts.give'
  | 'external_contacts.payments'
  // MONEY
  | 'cash.overview'
  | 'expenses.record'
  | 'expenses.view'
  | 'withdrawals'
  | 'currency.rates'
  // PEOPLE
  | 'employees.manage'
  | 'payroll.pay'
  | 'handovers.mini'
  | 'handovers.approve'
  | 'activity.log';

export interface ServiceDefinition {
  readonly key: ServiceKey;
  readonly group: ServiceGroup;
  /**
   * The ceiling — tiers a role CAN grant this to, mirroring `@AllowedFor` on the
   * underlying routes. The role editor greys out checkboxes outside it; the
   * enforcement itself is still `@AllowedFor`, not this list.
   */
  readonly tiers: readonly ActorTier[];
  /**
   * Tiers that hold this service unconditionally, even on an empty or absent
   * role. Exposed on the catalogue so clients can predict what a role will
   * actually resolve to without re-encoding the rule.
   */
  readonly mandatory: readonly ActorTier[];
  /** Reads this service cannot function without — granted implicitly, transitively. */
  readonly implies: readonly ServiceKey[];
}

/** Rows omit `mandatory` when nothing is unconditional, which is the norm. */
type ServiceSpec = Omit<ServiceDefinition, 'key' | 'mandatory'> & {
  readonly mandatory?: readonly ActorTier[];
};

const OWNER_ONLY: readonly ActorTier[] = ['OWNER'];
const STAFF: readonly ActorTier[] = ['OWNER', 'FULL_EMPLOYEE'];
const EVERYONE: readonly ActorTier[] = ['OWNER', 'FULL_EMPLOYEE', 'MINI_EMPLOYEE'];

/**
 * Declared as a Record keyed by ServiceKey so the compiler rejects a key added to
 * the union but forgotten here. Declaration order is the display order.
 */
const DEFINITIONS: Record<ServiceKey, ServiceSpec> = {
  // ---------------------------------------------------------------- SALES
  'sales.record': { group: 'SALES', tiers: EVERYONE, implies: ['inventory.view'] },
  'sales.history': { group: 'SALES', tiers: EVERYONE, implies: [] },
  'sales.analytics': { group: 'SALES', tiers: STAFF, implies: [] },

  // ---------------------------------------------------------------- STOCK
  'inventory.view': { group: 'STOCK', tiers: EVERYONE, implies: [] },
  'inventory.receive': {
    group: 'STOCK',
    tiers: STAFF,
    implies: ['inventory.view', 'suppliers.view'],
  },
  'inventory.add_personal': {
    group: 'STOCK',
    tiers: STAFF,
    implies: ['inventory.view'],
  },
  'inventory.adjust': {
    group: 'STOCK',
    tiers: STAFF,
    implies: ['inventory.view'],
  },
  // Owner edits `:id/selling-price`; a mini re-prices their own consigned stock
  // through `mini-selling-price` / `mini-carton-price`.
  'inventory.price': {
    group: 'STOCK',
    tiers: EVERYONE,
    implies: ['inventory.view'],
  },
  'products.manage': {
    group: 'STOCK',
    tiers: STAFF,
    implies: ['inventory.view'],
  },
  'pricing.catalog': { group: 'STOCK', tiers: STAFF, implies: [] },
  'inventory.movements': { group: 'STOCK', tiers: STAFF, implies: ['inventory.view'] },

  // -------------------------------------------------------------- NETWORK
  'suppliers.view': { group: 'NETWORK', tiers: STAFF, implies: [] },
  'suppliers.pay': { group: 'NETWORK', tiers: STAFF, implies: ['suppliers.view'] },
  'debtors.view': { group: 'NETWORK', tiers: STAFF, implies: [] },
  'debtors.collect': { group: 'NETWORK', tiers: STAFF, implies: ['debtors.view'] },
  'consignments.send': { group: 'NETWORK', tiers: STAFF, implies: ['inventory.view', 'debtors.view'] },
  'consignments.receive': { group: 'NETWORK', tiers: EVERYONE, implies: [] },
  'external_contacts.view': { group: 'NETWORK', tiers: STAFF, implies: [] },
  'external_contacts.manage': { group: 'NETWORK', tiers: STAFF, implies: ['external_contacts.view'] },
  'external_contacts.give': { group: 'NETWORK', tiers: STAFF, implies: ['external_contacts.view', 'inventory.view'] },
  'external_contacts.payments': { group: 'NETWORK', tiers: STAFF, implies: ['external_contacts.view'] },

  // ---------------------------------------------------------------- MONEY
  'cash.overview': { group: 'MONEY', tiers: STAFF, implies: [] },
  'expenses.record': { group: 'MONEY', tiers: EVERYONE, implies: [] },
  'expenses.view': { group: 'MONEY', tiers: EVERYONE, implies: [] },
  'withdrawals': { group: 'MONEY', tiers: OWNER_ONLY, implies: [] },
  'currency.rates': { group: 'MONEY', tiers: OWNER_ONLY, implies: [] },

  // --------------------------------------------------------------- PEOPLE
  'employees.manage': { group: 'PEOPLE', tiers: OWNER_ONLY, implies: [] },
  'payroll.pay': { group: 'PEOPLE', tiers: OWNER_ONLY, implies: [] },
  'handovers.mini': {
    group: 'PEOPLE',
    tiers: ['MINI_EMPLOYEE'],
    // How the employer gets their cash and unsold stock back — never revocable.
    mandatory: ['MINI_EMPLOYEE'],
    implies: [],
  },
  'handovers.approve': { group: 'PEOPLE', tiers: STAFF, implies: [] },
  'activity.log': { group: 'PEOPLE', tiers: STAFF, implies: [] },
};

export const SERVICE_CATALOG: readonly ServiceDefinition[] = Object.entries(
  DEFINITIONS,
).map(([key, def]) => ({ key: key as ServiceKey, ...def, mandatory: def.mandatory ?? [] }));

export const ALL_SERVICE_KEYS: readonly ServiceKey[] = SERVICE_CATALOG.map((s) => s.key);

const KEY_SET = new Set<string>(ALL_SERVICE_KEYS);

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

/**
 * Services a tier ALWAYS holds, even on an empty or absent role. Derived from the
 * catalogue's `mandatory` flag so the rule lives in exactly one place — the
 * clients read the same flag off `GET /employee-roles/catalog`.
 *
 * Only a mini's handover qualifies: it is how the employer gets their cash and
 * unsold stock back, and leaving it revocable meant a forgotten checkbox could
 * strand both with an employee who then had no way to settle up.
 */
export function mandatoryServicesForTier(tier: ActorTier): ServiceKey[] {
  return SERVICE_CATALOG.filter((s) => s.mandatory.includes(tier)).map((s) => s.key);
}

/** Transitive closure over `implies`. Unknown keys (a stale row) are dropped. */
export function expandServices(keys: Iterable<string>): Set<ServiceKey> {
  const out = new Set<ServiceKey>();
  const stack: ServiceKey[] = [];
  for (const key of keys) {
    if (isServiceKey(key)) stack.push(key);
  }
  while (stack.length > 0) {
    const key = stack.pop() as ServiceKey;
    if (out.has(key)) continue;
    out.add(key);
    for (const dep of DEFINITIONS[key].implies) stack.push(dep);
  }
  return out;
}

/**
 * Everything a tier is capable of holding. Only meaningful for OWNER, who is
 * never restricted by a role — an employee's set comes from their role alone.
 */
export function allServicesForTier(tier: ActorTier): Set<ServiceKey> {
  return new Set(SERVICE_CATALOG.filter((s) => s.tiers.includes(tier)).map((s) => s.key));
}

/**
 * The effective service set for one request — the single function the guard calls.
 *
 * - OWNER (nobody's employee, including a full employee acting on their own books
 *   via `X-Acting-As: self`) holds everything the tier permits. Roles never bind
 *   an owner on their own books.
 * - An employee holds exactly what their role grants, expanded through `implies`
 *   and trimmed to the tier ceiling.
 * - An employee with NO role holds nothing. Access is given, never assumed: an
 *   employer who has not opened anything has not opened anything. The sole
 *   exception is `MANDATORY_BY_TIER` — a mini can always hand takings back.
 *
 * The always-on core (identity, own salary, accepting or leaving the job) is not
 * expressed here — those routes carry no `@RequiresService` at all, so an
 * employee can never be locked out of seeing what they are owed or quitting.
 */
export function resolveGrantedServices(
  roleServices: readonly string[] | null | undefined,
  tier: ActorTier,
): Set<ServiceKey> {
  if (tier === 'OWNER') return allServicesForTier('OWNER');
  const expanded = roleServices == null ? new Set<ServiceKey>() : expandServices(roleServices);
  for (const key of mandatoryServicesForTier(tier)) expanded.add(key);
  const granted = new Set<ServiceKey>();
  for (const key of expanded) {
    if (DEFINITIONS[key].tiers.includes(tier)) granted.add(key);
  }
  return granted;
}

export type RolePresetKey =
  | 'CASHIER'
  | 'SHOP_ASSISTANT'
  | 'STOCK_KEEPER'
  | 'MANAGER'
  | 'MINI_SELLER';

export interface RolePreset {
  readonly key: RolePresetKey;
  /** Tier the preset is meant for — the role editor uses it to sort suggestions. */
  readonly tier: ActorTier;
  readonly services: readonly ServiceKey[];
}

/** Starting points offered by the role editor. Labels come from each app's i18n. */
export const ROLE_PRESETS: readonly RolePreset[] = [
  {
    key: 'CASHIER',
    tier: 'FULL_EMPLOYEE',
    services: ['sales.record', 'sales.history', 'inventory.view', 'expenses.record', 'expenses.view'],
  },
  {
    key: 'SHOP_ASSISTANT',
    tier: 'FULL_EMPLOYEE',
    services: [
      'sales.record',
      'sales.history',
      'inventory.view',
      'expenses.record',
      'expenses.view',
      'consignments.receive',
      'external_contacts.view',
      'external_contacts.give',
      'debtors.view',
      'debtors.collect',
    ],
  },
  {
    key: 'STOCK_KEEPER',
    tier: 'FULL_EMPLOYEE',
    services: [
      'inventory.view',
      'inventory.receive',
      'inventory.add_personal',
      'inventory.adjust',
      'inventory.movements',
      'products.manage',
      'suppliers.view',
    ],
  },
  {
    key: 'MANAGER',
    tier: 'FULL_EMPLOYEE',
    services: SERVICE_CATALOG.filter((s) => s.tiers.includes('FULL_EMPLOYEE')).map((s) => s.key),
  },
  {
    key: 'MINI_SELLER',
    tier: 'MINI_EMPLOYEE',
    services: [
      'sales.record',
      'sales.history',
      'inventory.view',
      'consignments.receive',
      'handovers.mini',
      'expenses.record',
      'expenses.view',
    ],
  },
];
