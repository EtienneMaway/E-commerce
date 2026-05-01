interface ActorPillProps {
  actor: { id: string; username: string } | null | undefined;
  viewerId?: string;
  /** When non-null, render a small inline discount note next to the actor. */
  discount?: { originalUnitPrice: string | null; discountReason: string | null; effectivePrice?: string };
}

/**
 * "Self" when the action was performed by the owner themselves (actor missing or matches viewer);
 * "By {username}" when an employee performed it on the owner's behalf.
 */
export function ActorPill({ actor, viewerId, discount }: ActorPillProps) {
  const isSelf = !actor || (viewerId && actor.id === viewerId);
  const label = isSelf ? 'Self' : `By ${actor!.username}`;
  const showDiscount = discount?.originalUnitPrice;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
        style={
          isSelf
            ? { background: 'rgba(127,127,127,0.12)', color: 'var(--foreground)' }
            : { background: 'rgba(99,102,241,0.15)', color: '#818CF8' }
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
