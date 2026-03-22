import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

const THEME_KEY = 'ta_theme';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggle: () => Promise<void>;
  init: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',

  toggle: async () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    set({ theme: next });
    await SecureStore.setItemAsync(THEME_KEY, next);
  },

  init: async () => {
    try {
      const stored = await SecureStore.getItemAsync(THEME_KEY);
      if (stored === 'light' || stored === 'dark') {
        set({ theme: stored });
      } else {
        const system = Appearance.getColorScheme();
        set({ theme: system === 'dark' ? 'dark' : 'light' });
      }
    } catch {
      set({ theme: 'light' });
    }
  },
}));
