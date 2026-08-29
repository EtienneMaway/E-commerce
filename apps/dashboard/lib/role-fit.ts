import type { ActorTier, ServiceCatalog } from './api';

/**
 * What a role actually resolves to for a given employee tier.
 *
 * Mirrors `resolveGrantedServices` on the API: expand `implies`, add whatever is
 * mandatory for the tier, then drop anything above the tier ceiling. Both sides
 * read the same catalogue, so this predicts the real outcome rather than
 * guessing at it.
 *
 * The reason this exists: an employer can happily build a role out of owner- or
 * staff-only features and attach it to a mini, who then receives almost none of
 * it. Nothing is broken — the ceiling is doing its job — but silently handing
 * someone a role that does nothing is a bad way to find that out.
 */
export interface RoleFit {
  /** Keys the employee will actually hold. */
  granted: string[];
  /** Keys the role lists (or implies) that this tier can never hold. */
  dropped: string[];
  /** Granted keys the employee would have anyway, role or not. */
  mandatory: string[];
  /** True when the role adds nothing beyond what the tier already guarantees. */
  addsNothing: boolean;
}

export function computeRoleFit(
  services: readonly string[],
  tier: ActorTier,
  catalog: ServiceCatalog,
): RoleFit {
  const byKey = new Map(catalog.services.map((s) => [s.key, s]));

  const expanded = new Set<string>();
  const walk = (key: string) => {
    if (expanded.has(key) || !byKey.has(key)) return;
    expanded.add(key);
    for (const dep of byKey.get(key)!.implies) walk(dep);
  };
  for (const key of services) walk(key);

  const mandatory = catalog.services
    .filter((s) => s.mandatory.includes(tier))
    .map((s) => s.key);
  for (const key of mandatory) expanded.add(key);

  const granted: string[] = [];
  const dropped: string[] = [];
  for (const key of expanded) {
    if (byKey.get(key)?.tiers.includes(tier)) granted.push(key);
    else dropped.push(key);
  }

  return {
    granted: granted.sort(),
    dropped: dropped.sort(),
    mandatory,
    addsNothing: granted.every((k) => mandatory.includes(k)),
  };
}

/** The employment tier as stored, mapped to the actor tier roles are scoped by. */
export function tierOfEmployment(tier: 'FULL' | 'SALES_ONLY'): ActorTier {
  return tier === 'SALES_ONLY' ? 'MINI_EMPLOYEE' : 'FULL_EMPLOYEE';
}
