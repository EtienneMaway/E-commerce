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
  /**
   * The consignment rate this product's stock was locked at (minis only).
   * Cached so an offline expense allowance converts each sale to FC exactly the
   * way the server will when the queue drains, instead of at the session rate.
   */
  usdToFcRateSnapshot?: string | null;
}

/**
 * The mini's expense ceiling as the server last computed it, frozen when going
 * offline. `soldFc`/`spentFc` cover everything already synced; the app adds the
 * offline queue on top (see `lib/mini-allowance.ts`) so the budget keeps growing
 * with offline sales and expenses are refused on the spot rather than piling up
 * to be rejected at sync time.
 */
export interface AllowanceSnapshot {
  /** Employer's percentage; null = no ceiling was set. */
  pct: string | null;
  /** Agreed value sold this cycle, FC, at the point of going offline. */
  soldFc: string;
  /** Expenses already claimed this cycle, FC, at the point of going offline. */
  spentFc: string;
}

export interface PendingSale {
  id: string;
  productName: string;
  qtySold: number;
  salePrice: string;    // per unit, USD
  recordedAt: string;
  syncError: string | null;
  // Buyer details captured at the post-sale receipt prompt. Sent with the
  // initial POST when the queue drains — saves a round-trip vs the online
  // create+PATCH pattern. Optional: if the merchant skipped the prompt
  // these stay undefined.
  clientName?: string;
  clientPhone?: string;
  // Shared across every PendingSale that came out of one cart submission so
  // the server can group them into a single reprintable receipt.
  receiptId?: string;
  // Quantity ("group of prices") discount metadata, when one was applied. The
  // `salePrice` above is already the discounted per-unit USD; these preserve
  // the pre-discount price + reason so the replayed sale records identically.
  originalUnitPrice?: string;
  discountReason?: string;
}

export interface PendingExpense {
  id: string;
  /** 'mini' → mini-employee handover expense (FC); 'normal' → owner/full-employee expense. */
  kind: 'mini' | 'normal';
  amount: string;
  category: string;
  /** Normal expenses only — mini expenses are always FC. */
  currency?: 'USD' | 'FC';
  description?: string;
  /** Normal expenses only — ISO date. */
  date?: string;
  recordedAt: string;
  syncError: string | null;
}

export interface SyncProgress {
  /** Total sales in this sync run (synced-so-far + still-remaining). */
  total: number;
  /** How many have been confirmed synced so far in this run. */
  completed: number;
}

interface OfflineState {
  isOffline: boolean;
  cachedProducts: CachedProduct[];
  pendingSales: PendingSale[];
  pendingExpenses: PendingExpense[];
  syncStatus: 'idle' | 'syncing' | 'error';
  // Live progress of the current/last sync run. Drives the progress bar + %.
  // Persisted so a run interrupted by an app kill still shows where it stood.
  syncProgress: SyncProgress | null;
  lastSyncedAt: string | null;
  snapshotTakenAt: string | null;
  // Exchange rate at the moment of going offline. The rate is administratively
  // set on the API and doesn't fluctuate intraday, so freezing it for the
  // duration of an offline session is correct — every FC↔USD conversion the
  // app does while offline reads from here, never from the (failing) currency
  // query that would otherwise fall back to '1' and silently corrupt prices.
  snapshotRate: string | null;
  /** Mini employees only — null for everyone else, and when no cap is set. */
  allowanceSnapshot: AllowanceSnapshot | null;

  enableOfflineMode: (
    products: CachedProduct[],
    rate: string,
    allowance?: AllowanceSnapshot | null,
  ) => void;
  disableOfflineMode: () => void;
  recordOfflineSale: (
    productName: string,
    qtySold: number,
    salePrice: string,
    extras?: {
      receiptId?: string;
      clientName?: string;
      clientPhone?: string;
      originalUnitPrice?: string;
      discountReason?: string;
      /**
       * Reuse an id already sent to the server as `clientSaleId` (an online
       * attempt that failed with no verdict). The replay in lib/sync.ts sends
       * the row id as `clientSaleId`, so carrying the original key over is what
       * makes the retry dedupe instead of recording the sale twice.
       */
      id?: string;
    },
  ) => void;
  /** Patch buyer info onto every pending sale that shares the given receiptId. */
  attachOfflineClient: (receiptId: string, clientName?: string, clientPhone?: string) => void;
  /** Queue a mini-employee expense (FC) for sync — used online-fail or offline. */
  recordOfflineExpense: (amount: string, category: string, description?: string) => void;
  /** Queue an owner/full-employee expense for sync when offline. */
  recordOfflineNormalExpense: (
    amount: string,
    currency: 'USD' | 'FC',
    category: string,
    description?: string,
    date?: string,
  ) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
  setLastSyncedAt: (at: string) => void;
  removeSyncedSales: (ids: string[]) => void;
  updateSaleError: (id: string, error: string) => void;
  removeSyncedExpenses: (ids: string[]) => void;
  updateExpenseError: (id: string, error: string) => void;
  /** Wipe per-row error flags before a "Restart" run so they can be retried fresh. */
  clearSyncErrors: () => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      isOffline: false,
      cachedProducts: [],
      pendingSales: [],
      pendingExpenses: [],
      syncStatus: 'idle',
      syncProgress: null,
      lastSyncedAt: null,
      snapshotTakenAt: null,
      snapshotRate: null,
      allowanceSnapshot: null,

      enableOfflineMode: (products, rate, allowance = null) =>
        set({
          isOffline: true,
          cachedProducts: products,
          snapshotTakenAt: new Date().toISOString(),
          snapshotRate: rate,
          allowanceSnapshot: allowance,
        }),

      disableOfflineMode: () => set({ isOffline: false }),

      recordOfflineSale: (productName, qtySold, salePrice, extras) => {
        const id = extras?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          pendingSales: [
            ...s.pendingSales,
            {
              id,
              productName,
              qtySold,
              salePrice,
              recordedAt: new Date().toISOString(),
              syncError: null,
              receiptId: extras?.receiptId,
              clientName: extras?.clientName,
              clientPhone: extras?.clientPhone,
              originalUnitPrice: extras?.originalUnitPrice,
              discountReason: extras?.discountReason,
            },
          ],
          cachedProducts: s.cachedProducts.map((p) =>
            p.productName === productName
              ? { ...p, availableQty: Math.max(0, p.availableQty - qtySold) }
              : p,
          ),
        }));
      },

      attachOfflineClient: (receiptId, clientName, clientPhone) =>
        set((s) => ({
          pendingSales: s.pendingSales.map((p) =>
            p.receiptId === receiptId
              ? { ...p, clientName: clientName || undefined, clientPhone: clientPhone || undefined }
              : p,
          ),
        })),

      recordOfflineExpense: (amount, category, description) => {
        const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          pendingExpenses: [
            ...s.pendingExpenses,
            { id, kind: 'mini', amount, category, description, recordedAt: new Date().toISOString(), syncError: null },
          ],
        }));
      },

      recordOfflineNormalExpense: (amount, currency, category, description, date) => {
        const id = `nexp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({
          pendingExpenses: [
            ...s.pendingExpenses,
            { id, kind: 'normal', amount, currency, category, description, date, recordedAt: new Date().toISOString(), syncError: null },
          ],
        }));
      },

      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setSyncProgress: (syncProgress) => set({ syncProgress }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      removeSyncedSales: (ids) =>
        set((s) => ({ pendingSales: s.pendingSales.filter((p) => !ids.includes(p.id)) })),
      updateSaleError: (id, error) =>
        set((s) => ({
          pendingSales: s.pendingSales.map((p) => (p.id === id ? { ...p, syncError: error } : p)),
        })),
      removeSyncedExpenses: (ids) =>
        set((s) => ({ pendingExpenses: s.pendingExpenses.filter((p) => !ids.includes(p.id)) })),
      updateExpenseError: (id, error) =>
        set((s) => ({
          pendingExpenses: s.pendingExpenses.map((p) => (p.id === id ? { ...p, syncError: error } : p)),
        })),
      clearSyncErrors: () =>
        set((s) => ({
          pendingSales: s.pendingSales.map((p) => ({ ...p, syncError: null })),
          pendingExpenses: s.pendingExpenses.map((p) => ({ ...p, syncError: null })),
        })),
    }),
    {
      name: 'offline-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
