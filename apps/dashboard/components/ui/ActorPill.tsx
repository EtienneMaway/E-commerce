import { useT } from '../../lib/i18n';
import { isClosedAccount } from '../../lib/person';

interface ActorPillProps {
  actor: { id: string; username: string; anonymizedAt?: string | null } | null | undefined;
  viewerId?: string;
  /** When non-null, render a small inline discount note next to the actor. */
  discount?: { originalUnitPrice: string | null; discountReason: string | null; effectivePrice?: string };
}

/**
 * "Self" when the action was performed by the owner themselves (actor missing or matches viewer);
 * "By {username}" when an employee performed it on the owner's behalf.
 */
export function ActorPill({ actor, viewerId, discount }: ActorPillProps) {
  const t = useT();
  const isSelf = !actor || (viewerId && actor.id === viewerId);
  // An employee who has since closed their account keeps the attribution, under
  // their role rather than the meaningless `deleted_user_…` handle.
  const label = isSelf
    ? 'Self'
    : isClosedAccount(actor) ? t.common.formerEmployee : `By ${actor!.username}`;
  const showDiscount = discount?.originalUnitPrice;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
        style={
          isSelf
            ? { background: 'rgba(127,127,127,0.12)', color: 'var(--foreground)' }
            : { background: 'rgba(var(--primary-rgb),0.15)', color: 'var(--primary-dark)' }
        }
      >
        {label}
      </span>
      {showDiscount && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
          title={discount?.discountReason ?? undefined}
        >
          Discount from {discount!.originalUnitPrice}
        </span>
      )}
    </span>
  );
}
