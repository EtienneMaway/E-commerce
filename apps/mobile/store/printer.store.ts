import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { PairedPrinter } from '../lib/bluetooth-printer';

const PRINTER_KEY = 'ta_printer';

interface PrinterState {
  printer: PairedPrinter | null;
  hydrated: boolean;
  setPrinter: (printer: PairedPrinter | null) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const usePrinterStore = create<PrinterState>((set) => ({
  printer: null,
  hydrated: false,

  setPrinter: async (printer) => {
    if (printer) {
      await SecureStore.setItemAsync(PRINTER_KEY, JSON.stringify(printer));
    } else {
      await SecureStore.deleteItemAsync(PRINTER_KEY);
    }
    set({ printer });
  },

  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(PRINTER_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PairedPrinter;
        set({ printer: parsed, hydrated: true });
        return;
      } catch {
        // fall through — wipe corrupt value
        await SecureStore.deleteItemAsync(PRINTER_KEY);
      }
    }
    set({ hydrated: true });
  },
}));
