'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { useT } from '../../lib/i18n';

/**
 * Sticky strip rendered just under the topbar when the user is acting on an
 * employer's books. The chip in the topbar is easy to miss; this banner makes
 * the active persona impossible to overlook and offers a one-click way back.
 *
 * Renders nothing in Self mode or for users without an active employment.
 */
export function PersonaBanner() {
  const t = useT();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { kind, setKind } = usePersonaStore();

  const employment = user?.activeEmployment;
  if (!employment || kind !== 'employer') return null;

  function back() {
    setKind('self');
    qc.resetQueries();
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
      style={{
        background: 'rgba(99,102,241,0.12)',
        color: '#A5B4FC',
        borderBottom: '1px solid rgba(99,102,241,0.25)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden>🪪</span>
        <span className="truncate">
          <b>{t.persona.bannerTitle(employment.employer.username)}</b>
          {employment.status === 'TERMINATION_REQUESTED'
            ? ` · ${t.persona.terminationPending}`
            : ''}
          <span className="ml-2 hidden sm:inline" style={{ opacity: 0.85 }}>
            {t.persona.bannerSub}
          </span>
        </span>
      </div>
      <button
        onClick={back}
        className="flex-shrink-0 font-semibold underline-offset-2 hover:underline"
        style={{ color: '#C7D2FE' }}
      >
        {t.persona.bannerSwitch} →
      </button>
    </div>
  );
}
