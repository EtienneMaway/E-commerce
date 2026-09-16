'use client';

import Link from 'next/link';
import { useShopStore } from '../../store/shop.store';
import { usePermissions } from '../../lib/permissions';
import { useT } from '../../lib/i18n';

/**
 * The business name, centred in the top bar.
 *
 * It answers "whose books am I looking at" — the one thing the band never said,
 * which matters most to the people this feature is for: someone who has just
 * been handed a second business, or an employee acting for an employer.
 *
 * Painted from `useShopStore`, which `(main)/layout.tsx` fills from `/auth/me`,
 * so it costs no request of its own. It renders nothing until that lands, and
 * nothing at all for an account with no business, rather than showing a
 * placeholder that would flash on every cold load.
 *
 * Clickable only when the reader may actually open the page: `RouteGuard` would
 * bounce anyone without `shops.manage` straight back to `/dashboard`, and a
 * link that throws you out is worse than plain text.
 */
export function OrgBadge() {
  const t = useT();
  const organization = useShopStore((s) => s.organization);
  const shops = useShopStore((s) => s.shops);
  const { can } = usePermissions();

  if (!organization) return null;

  const openBranches = shops.filter((s) => !s.isArchived).length;
  const canManage = can('shops.manage');

  const body = (
    <span className="flex items-center gap-2 min-w-0">
      <span
        className="org-badge-dot rounded-full flex-shrink-0"
        style={{
          width: 6,
          height: 6,
          background: 'var(--primary)',
          boxShadow: '0 0 8px rgba(var(--primary-rgb),0.9)',
        }}
        aria-hidden
      />
      <span className="org-badge-name text-sm font-semibold tracking-tight truncate">
        {organization.name}
      </span>
      {/* The branch count is the second question after "whose books" — but only
          once there is more than one, matching the switcher's own rule that a
          single-branch merchant never meets the concept. */}
      {openBranches > 1 && (
        <span
          className="hidden sm:inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            background: 'rgba(var(--sidebar-fg-rgb),0.10)',
            color: 'rgba(var(--sidebar-fg-rgb),0.65)',
          }}
        >
          {openBranches} {t.shops.statBranches.toLowerCase()}
        </span>
      )}
    </span>
  );

  if (!canManage) {
    return (
      <div className="anim-fade-in min-w-0 px-2 max-w-[60vw] sm:max-w-sm" title={organization.name}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href="/settings/business"
      title={t.shops.openBusiness}
      aria-label={`${organization.name} — ${t.shops.openBusiness}`}
      className="anim-fade-in min-w-0 px-2.5 py-1 rounded-full transition-colors max-w-[60vw] sm:max-w-sm"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(var(--sidebar-fg-rgb),0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
      }}
    >
      {body}
    </Link>
  );
}
