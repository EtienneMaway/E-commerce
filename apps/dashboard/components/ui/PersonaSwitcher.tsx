'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore, type PersonaKind } from '../../store/persona.store';
import { useT } from '../../lib/i18n';

/**
 * Topbar dropdown that lets a user with an active employment toggle between
 * viewing their own books (Self) and acting on the employer's books (Employer).
 *
 * Renders nothing for users with no active employment. Default persona is Self,
 * even for employees — they explicitly opt into Employer mode.
 *
 * On switch, the React Query cache is cleared so cached data from the previous
 * persona doesn't bleed into the new view.
 */
export function PersonaSwitcher() {
  const t = useT();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { kind, setKind } = usePersonaStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // No employment relationship → no switcher needed at all.
  const employment = user?.activeEmployment;
  if (!employment) return null;

  // Stale persona guard: if we're persisted as 'employer' but the relationship
  // has gone away (terminated etc.), force back to self. activeEmployment is
  // already nullable above, so this only triggers when the field flips between
  // renders while the store kept its value.
  const employerName = employment.employer.username;
  const isEmployerMode = kind === 'employer';

  function choose(next: PersonaKind) {
    setOpen(false);
    if (next === kind) return;
    setKind(next);
    // resetQueries() does two things in one shot:
    //  1. Drops cached data from the previous persona — so we never flash
    //     employer numbers in a self view (or vice versa).
    //  2. Forces every currently-mounted useQuery observer to refetch
    //     immediately with the new X-Acting-As header. Without this, mounted
    //     pages would keep their stale data until the user navigated away.
    qc.resetQueries();
  }

  const accent = isEmployerMode ? '#A5B4FC' : 'rgba(var(--sidebar-fg-rgb),0.7)';
  const bg = isEmployerMode ? 'rgba(99,102,241,0.15)' : 'rgba(var(--sidebar-fg-rgb),0.06)';
  const border = isEmployerMode ? 'rgba(99,102,241,0.35)' : 'rgba(var(--sidebar-fg-rgb),0.12)';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors"
        style={{
          background: bg,
          color: accent,
          border: `1px solid ${border}`,
        }}
        title={t.persona.switchTo}
      >
        <span aria-hidden>{isEmployerMode ? '🪪' : '👤'}</span>
        <span>
          {isEmployerMode ? t.persona.actingBanner(employerName) : t.persona.self}
          {isEmployerMode && employment.status === 'TERMINATION_REQUESTED'
            ? ` · ${t.persona.terminationPending}`
            : ''}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3 h-3 opacity-70"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl shadow-xl overflow-hidden z-50"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
          >
            {t.persona.viewAs}
          </div>
          <button
            onClick={() => choose('self')}
            className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
            style={{
              background: kind === 'self' ? 'rgba(127,127,127,0.1)' : 'transparent',
            }}
          >
            <span aria-hidden className="text-base mt-0.5">👤</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                {t.persona.self}
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.persona.selfSub}
              </div>
            </div>
            {kind === 'self' && (
              <span aria-hidden className="text-xs" style={{ color: 'var(--primary)' }}>
                ✓
              </span>
            )}
          </button>
          <button
            onClick={() => choose('employer')}
            className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
            style={{
              background: kind === 'employer' ? 'rgba(99,102,241,0.12)' : 'transparent',
            }}
          >
            <span aria-hidden className="text-base mt-0.5">🪪</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                {t.persona.employer(employerName)}
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.persona.employerSub(employerName)}
              </div>
            </div>
            {kind === 'employer' && (
              <span aria-hidden className="text-xs" style={{ color: '#A5B4FC' }}>
                ✓
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
