'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { KmbLogo } from '../../components/ui/KmbLogo';
import { UserMenu } from '../../components/ui/UserMenu';

const NAV_ICONS = [
  <svg key="dashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>,
  <svg key="inventory" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>,
  <svg key="movements" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="20" x2="12" y2="10"/>
    <line x1="18" y1="20" x2="18" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="16"/>
  </svg>,
  <svg key="suppliers" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>,
  <svg key="debtors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>,
  <svg key="sales" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>,
  <svg key="consignments" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
  </svg>,
  <svg key="external-contacts" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    <line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>
  </svg>,
  <svg key="expenses" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="15" y2="17"/>
  </svg>,
  <svg key="withdrawals" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="2" y="6" width="20" height="12" rx="2"/>
    <circle cx="12" cy="12" r="2.5"/>
    <path d="M6 12h.01M18 12h.01"/>
  </svg>,
  <svg key="settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>,
  <svg key="employees" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>,
  <svg key="pricing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>,
  <svg key="activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>,
];

function UserAvatar({ username }: { username: string }) {
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{
        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
      }}
    >
      {initials}
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, hydrate, logout, setUser } = useAuthStore();
  const t = useT();
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Track screen size to differentiate mobile/desktop behavior
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setSidebarOpen(false); // default closed on mobile
    };
    handler(mq);
    mq.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => mq.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  // When the current user is acting as an employee, hide owner-only nav entries:
  // employee management, pricing, and withdrawals (personal cash flow). The
  // employee still uses every other section against the *employer's* books — the
  // backend resolves effectiveOwnerId on each request.
  const isEmployee = !!user?.activeEmployment;
  const NAV = [
    { href: '/dashboard', label: t.nav.dashboard, icon: NAV_ICONS[0] },
    { href: '/inventory', label: t.nav.inventory, icon: NAV_ICONS[1] },
    { href: '/inventory/movements', label: t.nav.movements, icon: NAV_ICONS[2] },
    { href: '/suppliers', label: t.nav.suppliers, icon: NAV_ICONS[3] },
    { href: '/debtors', label: t.nav.debtors, icon: NAV_ICONS[4] },
    { href: '/sales', label: t.nav.sales, icon: NAV_ICONS[5] },
    { href: '/consignments', label: t.nav.consignments, icon: NAV_ICONS[6] },
    { href: '/external-contacts', label: t.nav.externalContacts, icon: NAV_ICONS[7] },
    { href: '/expenses', label: t.nav.expenses, icon: NAV_ICONS[8] },
    { href: '/activity', label: t.nav.activity, icon: NAV_ICONS[13] },
    ...(isEmployee
      ? []
      : [
          { href: '/withdrawals', label: t.nav.withdrawals, icon: NAV_ICONS[9] },
          { href: '/employees', label: t.nav.employees, icon: NAV_ICONS[11] },
          { href: '/pricing', label: t.nav.pricing, icon: NAV_ICONS[12] },
        ]),
    { href: '/settings', label: t.nav.settings, icon: NAV_ICONS[10] },
  ];

  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace('/login'); return; }
    authApi.me()
      .then((me) => { if (me) setUser(me); })
      .catch(() => { logout(); router.replace('/login'); });
  }, [hydrated, token, router, logout, setUser]);

  // Close sidebar on route change (mobile only)
  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [pathname, isMobile]);

  if (!hydrated) return null;

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--background)' }}>

      {/* ─── Top bar (always visible; acts as the global navbar) ────── */}
      <div
        className="fixed top-0 inset-x-0 z-40 flex items-center gap-3 px-4 h-14"
        style={{ background: 'var(--sidebar)', borderBottom: '1px solid rgba(var(--sidebar-fg-rgb),0.08)' }}
      >
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-2 rounded-lg flex-shrink-0 transition-colors"
          style={{ color: 'rgba(var(--sidebar-fg-rgb),0.7)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--sidebar-fg-rgb),0.08)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {sidebarOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          )}
        </button>
        {!sidebarOpen && (
          <div className="flex items-center gap-2">
            <KmbLogo size={28} />
            <span className="text-sm font-bold" style={{ color: 'var(--sidebar-fg)' }}>KMB</span>
          </div>
        )}
        {user?.activeEmployment && (
          <div
            className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: 'rgba(99,102,241,0.15)',
              color: '#A5B4FC',
              border: '1px solid rgba(99,102,241,0.35)',
            }}
            title={
              user.activeEmployment.status === 'TERMINATION_REQUESTED'
                ? 'Termination has been requested for this employment'
                : 'You are signed in as an employee — actions affect your employer\'s books'
            }
          >
            <span aria-hidden>🪪</span>
            <span>
              Acting on behalf of <b>@{user.activeEmployment.employer.username}</b>
              {user.activeEmployment.status === 'TERMINATION_REQUESTED' ? ' · termination pending' : ''}
            </span>
          </div>
        )}
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>

      {/* ─── Sidebar overlay (mobile only) ──────────────────────────── */}
      {sidebarOpen && isMobile && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative flex-shrink-0'} flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}`}
        style={{
          width: !isMobile && !sidebarOpen ? 0 : 240,
          paddingTop: isMobile ? 0 : 56,
          background: 'var(--sidebar)',
          borderRight: isMobile || sidebarOpen ? '1px solid rgba(var(--sidebar-fg-rgb),0.05)' : '0 solid transparent',
        }}
      >
        {/* Gradient accent at top */}
        <div
          className="absolute inset-x-0 top-0 h-48 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.2) 0%, transparent 70%)',
          }}
        />

        {/* Logo */}
        <div className="relative px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0" style={{ filter: 'drop-shadow(0 4px 12px rgba(99,102,241,0.45))' }}>
              <KmbLogo size={36} />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight tracking-tight" style={{ color: 'var(--sidebar-fg)' }}>KMB</div>
              <div className="text-[10px] leading-tight" style={{ color: 'rgba(var(--sidebar-fg-rgb),0.35)' }}>Kristo Mosungi na Bato</div>
              {user && <div className="text-xs mt-0.5" style={{ color: 'rgba(var(--sidebar-fg-rgb),0.4)' }}>@{user.username}</div>}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 mb-3" style={{ height: '1px', background: 'rgba(var(--sidebar-fg-rgb),0.06)' }} />

        {/* Nav section label */}
        <div className="px-5 mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--sidebar-fg-rgb),0.25)' }}>
            {t.nav.navigation}
          </span>
        </div>

        {/* Nav items */}
        <nav className="relative flex-1 px-3 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative"
                style={{
                  color: active ? 'var(--sidebar-fg)' : 'rgba(var(--sidebar-fg-rgb),0.7)',
                  background: active ? 'var(--sidebar-accent)' : 'transparent',
                  boxShadow: active ? 'inset 0 0 0 1px var(--sidebar-accent-border)' : 'none',
                }}
              >
                {/* Active indicator bar */}
                {active && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ background: '#6366F1', boxShadow: '0 0 8px rgba(99,102,241,0.8)' }}
                  />
                )}

                {/* Icon */}
                <span
                  className="transition-colors duration-200 flex-shrink-0"
                  style={{ color: active ? '#818CF8' : 'rgba(var(--sidebar-fg-rgb),0.35)', }}
                >
                  {item.icon}
                </span>

                <span>{item.label}</span>

                {/* Hover glow */}
                {!active && (
                  <span
                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ background: 'rgba(var(--sidebar-fg-rgb),0.04)' }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="relative p-3" style={{ borderTop: '1px solid rgba(var(--sidebar-fg-rgb),0.06)' }}>
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ color: 'rgba(var(--sidebar-fg-rgb),0.5)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#F87171'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(var(--sidebar-fg-rgb),0.5)'; }}
          >
            {user && <UserAvatar username={user.username} />}
            <span className="flex-1 text-left truncate">{t.nav.signOut}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 opacity-50 flex-shrink-0">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* ─── Main content ─────────────────────────────────────────────────── */}
      <main
        className="flex-1 overflow-auto pt-14"
        style={{ background: 'var(--background)' }}
      >
        <div className={!isMobile && !sidebarOpen ? 'max-w-7xl mx-auto' : ''}>
          {children}
        </div>
      </main>
    </div>
  );
}
