import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PairedPrinter } from '../lib/bluetooth-printer';

interface PrinterState {
  printer: PairedPrinter | null;
  setPrinter: (printer: PairedPrinter | null) => void;
}

/**
 * Holds the paired thermal-printer reference. Persisted to localStorage so
 * the pairing survives reloads — Web Bluetooth itself manages the actual
 * device permission via the browser, so this store only remembers the
 * device id/name and the print code re-resolves the live `BluetoothDevice`
 * via `navigator.bluetooth.getDevices()` on demand.
 */
export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      printer: null,
      setPrinter: (printer) => set({ printer }),
    }),
    {
      name: 'dashboard-printer',
      storage:
        typeof window !== 'undefined'
          ? createJSONStorage(() => localStorage)
          : undefined,
    },
  ),
);
