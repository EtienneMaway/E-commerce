import type { ActorContext } from '../types/actor-context';
import type { ServiceKey } from '../services/service-catalog';

/**
 * An `ActorContext` for unit tests, with the tenancy fields filled in.
 *
 * Specs across every module build one of these, so when `ActorContext` grows a
 * field there is one place to update rather than twenty.
 */
export function testCtx(over: Partial<ActorContext> = {}): ActorContext {
  const ownerId = over.effectiveOwnerId ?? over.actorId ?? 'owner-1';
  return {
    actorId: ownerId,
    effectiveOwnerId: ownerId,
    tier: 'OWNER',
    services: new Set<ServiceKey>(),
    employment: null,
    orgId: 'org-1',
    shopId: 'shop-1',
    visibleShopIds: ['shop-1'],
    shopScope: 'one',
    shopArchived: false,
    ...over,
  };
}

/** A context reading across every branch — writes are refused under this. */
export function allShopsCtx(over: Partial<ActorContext> = {}): ActorContext {
  return testCtx({ shopId: null, shopScope: 'all', ...over });
}
