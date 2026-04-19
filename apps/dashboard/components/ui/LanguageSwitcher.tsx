'use client';

import { useLocaleStore, type Locale } from '../../store/locale.store';

const LOCALES: { value: Locale; flag: string; short: string }[] = [
  { value: 'en', flag: '🇬🇧', short: 'EN' },
  { value: 'fr', flag: '🇫🇷', short: 'FR' },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocaleStore();

  return (
    <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(var(--sidebar-fg-rgb),0.06)' }}>
      {LOCALES.map((l) => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
          style={{
            background: locale === l.value ? 'var(--sidebar-accent)' : 'transparent',
            color: locale === l.value ? 'var(--sidebar-fg)' : 'rgba(var(--sidebar-fg-rgb),0.6)',
            boxShadow: locale === l.value ? 'inset 0 0 0 1px var(--sidebar-accent-border)' : 'none',
          }}
        >
          <span>{l.flag}</span>
          <span>{l.short}</span>
        </button>
      ))}
    </div>
  );
}
