import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CachedProduct {
  productName: string;
  unitCost: string;
  availableQty: number;
  // Carton-aware fields snapshotted at the moment of going offline so the
  // Record Sale modal can offer the same UX it does online (sell in cartons,
  // edit carton + unit price). Optional for backwards compat with stored
  // state from an older app version — falls back to piece-only mode.
  piecesPerCarton?: number | null;
  latestSellingPrice?: string;
  latestCartonPrice?: string | null;
  category?: string | null;
}

export interface PendingSale {
  id: string;
  productName: string;
  qtySold: number;
  salePrice: string;    // per unit, USD
  recordedAt: string;
  syncError: string | null;
}

interface OfflineState {
  isOffline: boolean;
  cachedProducts: CachedProduct[];
  pendingSales: PendingSale[];
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncedAt: string | null;
  snapshotTakenAt: string | null;
  // Exchange rate at the moment of going offline. The rate is administratively
  // set on the API and doesn't fluctuate intraday, so freezing it for the
  // duration of an offline session is correct — every FC↔USD conversion the
  // app does while offline reads from here, never from the (failing) currency
  // query that would otherwise fall back to '1' and silently corrupt prices.
  snapshotRate: string | null;

  enableOfflineMode: (products: CachedProduct[], rate: string) => void;
  disableOfflineMode: () => void;
  recordOfflineSale: (productName: string, qtySold: number, salePrice: string) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  setLastSyncedAt: (at: string) => void;
  removeSyncedSales: (ids: string[]) => void;
  updateSaleError: (id: string, error: string) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      isOffline: false,
      cachedProducts: [],
      pendingSales: [],
      syncStatus: 'idle',
      lastSyncedAt: null,
      snapshotTakenAt: null,
      snapshotRate: null,

      enableOfflineMode: (products, rate) =>
        set({
          isOffline: true,
          cachedProducts: products,
          snapshotTakenAt: new Date().toISOString(),
          snapshotRate: rate,
        }),

      disableOfflineMode: () => set({ isOffline: false }),

      recordOfflineSale: (productName, qtySold, salePrice) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          pendingSales: [
            ...s.pendingSales,
            { id, productName, qtySold, salePrice, recordedAt: new Date().toISOString(), syncError: null },
          ],
          cachedProducts: s.cachedProducts.map((p) =>
            p.productName === productName
              ? { ...p, availableQty: Math.max(0, p.availableQty - qtySold) }
              : p,
          ),
        }));
      },

      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      removeSyncedSales: (ids) =>
        set((s) => ({ pendingSales: s.pendingSales.filter((p) => !ids.includes(p.id)) })),
      updateSaleError: (id, error) =>
        set((s) => ({
          pendingSales: s.pendingSales.map((p) => (p.id === id ? { ...p, syncError: error } : p)),
        })),
    }),
    {
      name: 'offline-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
