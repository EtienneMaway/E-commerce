'use client';

import Link from 'next/link';
import { useAuthStore } from '../../../store/auth.store';
import { usePersonaStore } from '../../../store/persona.store';
import { usePermissions } from '../../../lib/permissions';
import { FALLBACK_ORDER, NAV_SERVICE } from '../../../lib/nav-services';
import { useT } from '../../../lib/i18n';

/**
 * Where an employee lands when their employer has not opened anything for them.
 *
 * Reached two ways: RouteGuard bounces them here from any gated page, and the
 * sidebar has almost nothing left to click. The job of this page is to make the
 * situation legible — "you are not broken, you are not locked out of your
 * account, your employer just hasn't given you anything yet" — and to point at
 * the things that always work.
 */
export default function NoAccessPage() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const persona = usePersonaStore((s) => s.kind);
  const { hasNoAccess, canAny } = usePermissions();
  const employer = user?.activeEmployment?.employer?.username;
  const roleName = user?.activeEmployment?.role?.name ?? null;

  // Access can land while this page is open (the employer assigns a role, the
  // next /auth/me brings it in). Showing the "nothing shared" copy at that point
  // would be plainly wrong, so the page flips instead of contradicting itself.
  if (!hasNoAccess) {
    const target =
      FALLBACK_ORDER.find((href) => {
        const req = NAV_SERVICE[href];
        return req === null || canAny(...(Array.isArray(req) ? req : [req]));
      }) ?? '/my-salary';
    return (
      <div className="page-content">
        <div className="max-w-lg mx-auto text-center" style={{ paddingTop: '10vh' }}>
          <div
            className="mx-auto mb-6 flex items-center justify-center rounded-full"
            style={{
              width: 88,
              height: 88,
              background: 'rgba(var(--success-rgb),0.10)',
              border: '1px solid rgba(var(--success-rgb),0.20)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--success)"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 40, height: 40 }}
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">{t.roles.accessGrantedTitle}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--foreground-secondary)' }}>
            {roleName ? t.roles.accessGrantedBody(roleName) : t.roles.accessGrantedBodyGeneric}
          </p>
          <Link href={target} className="btn btn-primary">
            {t.roles.noAccessNowGranted}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="max-w-lg mx-auto text-center" style={{ paddingTop: '6vh' }}>
        <div
          className="mx-auto mb-6 flex items-center justify-center rounded-full"
          style={{
            width: 88,
            height: 88,
            background: 'rgba(var(--primary-rgb),0.10)',
            border: '1px solid rgba(var(--primary-rgb),0.20)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 40, height: 40 }}
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-2">{t.roles.noAccessTitle}</h1>
        <p className="text-sm mb-1" style={{ color: 'var(--foreground-secondary)' }}>
          {employer ? t.roles.noAccessBody(employer) : t.roles.noAccessBodyGeneric}
        </p>
        {/* An employer can also assign a role that grants nothing — worth naming,
            so the employee does not think the assignment simply failed. */}
        {roleName && (
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            {t.roles.noAccessRole(roleName)}
          </p>
        )}

        <div
          className="mt-8 rounded-xl p-5 text-left"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
            {t.roles.noAccessStillCan}
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/my-salary" className="hover:underline" style={{ color: 'var(--primary)' }}>
                {t.nav.mySalary}
              </Link>
              <span style={{ color: 'var(--muted)' }}> — {t.roles.noAccessSalaryHint}</span>
            </li>
            <li style={{ color: 'var(--foreground-secondary)' }}>
              {t.roles.noAccessLeaveHint}
            </li>
          </ul>
        </div>

        {/* A full employee who also runs their own business is not stuck here —
            their own books are unaffected by the employer's role. */}
        {persona === 'employer' && (
          <p className="text-xs mt-6" style={{ color: 'var(--muted)' }}>
            {t.roles.noAccessPersonaHint}
          </p>
        )}

      </div>
    </div>
  );
}
