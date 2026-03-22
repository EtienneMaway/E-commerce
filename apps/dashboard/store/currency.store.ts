'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DisplayCurrency = 'USD' | 'FC';

interface CurrencyState {
  displayCurrency: DisplayCurrency;
  toggle: () => void;
  setDisplay: (c: DisplayCurrency) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      displayCurrency: 'USD',
      toggle: () =>
        set({ displayCurrency: get().displayCurrency === 'USD' ? 'FC' : 'USD' }),
      setDisplay: (displayCurrency) => set({ displayCurrency }),
    }),
    { name: 'ta_currency' },
  ),
);
