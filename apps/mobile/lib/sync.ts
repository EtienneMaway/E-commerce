import { salesApi } from './api';
import { useOfflineStore } from '../store/offline.store';
import { isPriceGuardWarning, getErrorMessage } from './utils';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Submits all pending offline sales to the API.
 * Price-guard warnings are auto-confirmed (user already chose the markup offline).
 * Returns a summary of what succeeded and what failed.
 */
export async function syncPendingSales(): Promise<SyncResult> {
  const { pendingSales, setSyncStatus, removeSyncedSales, updateSaleError, setLastSyncedAt } =
    useOfflineStore.getState();

  if (pendingSales.length === 0) return { synced: 0, failed: 0, errors: [] };

  setSyncStatus('syncing');

  const syncedIds: string[] = [];
  const errors: string[] = [];

  for (const sale of pendingSales) {
    try {
      await salesApi.record({
        productName: sale.productName,
        qtySold: sale.qtySold,
        salePrice: sale.salePrice,
      });
      syncedIds.push(sale.id);
    } catch (err) {
      // Price guard: auto-confirm since the user already set the markup offline
      if (isPriceGuardWarning(err)) {
        try {
          await salesApi.record({
            productName: sale.productName,
            qtySold: sale.qtySold,
            salePrice: sale.salePrice,
            confirmedOverride: true,
          });
          syncedIds.push(sale.id);
          continue;
        } catch (err2) {
          const msg = `${sale.productName}: ${getErrorMessage(err2)}`;
          errors.push(msg);
          updateSaleError(sale.id, msg);
          continue;
        }
      }
      const msg = `${sale.productName}: ${getErrorMessage(err)}`;
      errors.push(msg);
      updateSaleError(sale.id, msg);
    }
  }

  removeSyncedSales(syncedIds);
  setLastSyncedAt(new Date().toISOString());
  setSyncStatus(errors.length > 0 ? 'error' : 'idle');

  return { synced: syncedIds.length, failed: errors.length, errors };
}
