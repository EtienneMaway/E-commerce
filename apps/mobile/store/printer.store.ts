import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { PairedPrinter } from '../lib/bluetooth-printer';

const PRINTER_KEY = 'ta_printer';

/**
 * Two supported printer kinds — no others (no network/IP/AirPrint printers):
 *   - 'bluetooth': an external Bluetooth thermal printer, identified by MAC address.
 *   - 'builtin': the printer built into a POS terminal itself — no pairing,
 *     no address, just a marker that the built-in driver should be used. Under
 *     the hood this tries genuine Sunmi hardware's raw AIDL printer first,
 *     falling back to the Android system print dialog for POS clones that
 *     only expose their printer as a plain print service (lib/builtin-printer.ts).
 */
export type PrinterConfig = ({ kind: 'bluetooth' } & PairedPrinter) | { kind: 'builtin'; name: string };

interface PrinterState {
  printer: PrinterConfig | null;
  hydrated: boolean;
  setPrinter: (printer: PrinterConfig | null) => Promise<void>;
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
        const parsed = JSON.parse(raw) as PrinterConfig | PairedPrinter | { kind: 'sunmi'; name: string };
        // Pre-Sunmi-support installs persisted a plain `{ address, name }` with
        // no `kind` — treat those as Bluetooth so existing pairings survive.
        // Pre-'builtin'-rename installs persisted `kind: 'sunmi'` — migrate to
        // the generalized 'builtin' kind so existing selections survive too.
        let migrated: PrinterConfig;
        if (!('kind' in parsed)) {
          migrated = { kind: 'bluetooth', ...parsed };
        } else if (parsed.kind === 'sunmi') {
          migrated = { kind: 'builtin', name: parsed.name };
        } else {
          migrated = parsed;
        }
        set({ printer: migrated, hydrated: true });
        return;
      } catch {
        // fall through — wipe corrupt value
        await SecureStore.deleteItemAsync(PRINTER_KEY);
      }
    }
    set({ hydrated: true });
  },
}));
