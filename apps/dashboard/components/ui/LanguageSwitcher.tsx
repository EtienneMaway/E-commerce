'use client';

import { useLocaleStore, type Locale } from '../../store/locale.store';

const LOCALES: { value: Locale; flag: string; short: string }[] = [
  { value: 'en', flag: '🇬🇧', short: 'EN' },
  { value: 'fr', flag: '🇫🇷', short: 'FR' },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocaleStore();

  return (
    <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
      {LOCALES.map((l) => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
          style={{
            background: locale === l.value ? 'rgba(99,102,241,0.35)' : 'transparent',
            color: locale === l.value ? '#fff' : 'rgba(255,255,255,0.4)',
            boxShadow: locale === l.value ? 'inset 0 0 0 1px rgba(99,102,241,0.4)' : 'none',
          }}
        >
          <span>{l.flag}</span>
          <span>{l.short}</span>
        </button>
      ))}
    </div>
  );
}
