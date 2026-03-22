import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type Locale = 'en' | 'fr';

const LOCALE_KEY = 'ta_locale';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  init: () => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'en',

  setLocale: async (locale: Locale) => {
    set({ locale });
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
  },

  init: async () => {
    try {
      const stored = await SecureStore.getItemAsync(LOCALE_KEY);
      if (stored === 'en' || stored === 'fr') {
        set({ locale: stored });
      } else {
        // Fall back to device locale
        const deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
        const locale: Locale = deviceLocale.startsWith('fr') ? 'fr' : 'en';
        set({ locale });
      }
    } catch {
      set({ locale: 'en' });
    }
  },
}));
