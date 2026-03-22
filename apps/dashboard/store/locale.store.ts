'use client';

import { create } from 'zustand';

export type Locale = 'en' | 'fr';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  init: () => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'en',
  setLocale: (locale: Locale) => {
    localStorage.setItem('ta_locale', locale);
    set({ locale });
  },
  init: () => {
    const stored = localStorage.getItem('ta_locale') as Locale | null;
    const browserLang = navigator.language.startsWith('fr') ? 'fr' : 'en';
    const locale = stored ?? browserLang;
    set({ locale });
  },
}));
