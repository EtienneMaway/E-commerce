'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { useCurrencyStore } from '../../store/currency.store';
import { useLocaleStore, type Locale } from '../../store/locale.store';
import { useThemeStore } from '../../store/theme.store';
import { useT } from '../../lib/i18n';

const LOCALES: { value: Locale; flag: string; short: string }[] = [
  { value: 'en', flag: '🇬🇧', short: 'EN' },
  { value: 'fr', flag: '🇫🇷', short: 'FR' },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export function UserMenu() {
  const t = useT();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const { displayCurrency, toggle: toggleCurrency } = useCurrencyStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleSignOut() {
    setOpen(false);
    logout();
    router.push('/login');
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open more menu"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
        style={{
          background: open ? 'var(--primary-light)' : 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-4 h-4">
          <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
        </svg>
        <span className="text-xs font-semibold">{t.nav.more}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="w-3 h-3 flex-shrink-0"
          style={{
            color: 'var(--muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.15s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-50"
          style={{
            width: 260,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* User info (will link to profile) */}
          {user && (user.username || user.email) && (
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                  color: '#fff',
                  boxShadow: '0 2px 6px rgba(99,102,241,0.35)',
                }}
              >
                {(user.username || user.email || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  {t.nav.signedInAs}
                </p>
                {user.username ? (
                  <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: 'var(--foreground)' }}>
                    @{user.username}
                  </p>
                ) : (
                  user.email && (
                    <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: 'var(--foreground)' }}>
                      {user.email}
                    </p>
                  )
                )}
                {user.username && user.email && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                    {user.email}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Language */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
              {t.nav.language}
            </p>
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{ background: 'var(--surface)' }}
            >
              {LOCALES.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLocale(l.value)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex-1 justify-center"
                  style={{
                    background: locale === l.value ? 'var(--card)' : 'transparent',
                    color: locale === l.value ? 'var(--foreground)' : 'var(--muted)',
                    boxShadow: locale === l.value ? 'var(--shadow-xs)' : 'none',
                  }}
                >
                  <span>{l.flag}</span>
                  <span>{l.short}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={toggleCurrency}
              className="w-full flex items-center gap-3 text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              <span
                className="flex-shrink-0 text-sm font-bold w-4 h-4 flex items-center justify-center rounded"
                style={{ color: 'var(--muted)' }}
              >
                ⇄
              </span>
              <span className="flex-1 text-left">
                {displayCurrency === 'USD' ? 'View in FC' : 'View in USD'}
              </span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                }}
              >
                {displayCurrency}
              </span>
            </button>
          </div>

          {/* Dark mode */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors"
            style={{ color: 'var(--foreground)', borderBottom: '1px solid var(--border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span style={{ color: 'var(--muted)' }}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </span>
            <span>{theme === 'dark' ? t.nav.lightMode : t.nav.darkMode}</span>
          </button>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors"
            style={{ color: 'var(--danger)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--danger-rgb),0.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{t.nav.signOut}</span>
          </button>
        </div>
      )}
    </div>
  );
}
