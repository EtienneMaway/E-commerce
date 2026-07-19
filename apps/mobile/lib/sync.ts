import axios from 'axios';
import { salesApi, miniSettlementsApi, expensesApi } from './api';
import { useOfflineStore } from '../store/offline.store';
import { isPriceGuardWarning, getErrorMessage } from './utils';
import type { ExpenseCategory, ExpenseCurrency } from './api';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

// Sync is tuned for poor connectivity: a generous per-request timeout (the
// global axios client uses 10s, too tight for a 2G/edge link) and a handful of
// retries with exponential backoff + jitter. Retries are safe because every
// sale carries a stable `clientSaleId` the API dedupes on — a request that the
// server committed but never acknowledged is matched on retry, not duplicated.
const SYNC_REQUEST_TIMEOUT = 45_000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 8_000;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Whether an error is worth retrying. Network failures and timeouts (no
 * response at all) and transient server errors (5xx / 429) are retryable.
 * A definite client-side rejection (other 4xx) is permanent — retrying it
 * would just fail again, so we surface it instead of spinning.
 */
function isRetryable(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    // No response → DNS/connection/timeout failure on a flaky link.
    if (!err.response) return true;
    const status = err.response.status;
    return status >= 500 || status === 429;
  }
  // Unknown shape — treat as transient rather than permanently failing a sale.
  return true;
}

/**
 * Submits all pending offline sales to the API, newest queue order preserved.
 *
 * - Each sale is retried with backoff on transient/network errors.
 * - Price-guard warnings are auto-confirmed (the user already chose the markup
 *   when recording the sale offline).
 * - Synced rows are removed from the queue **incrementally**, so if the app is
 *   killed mid-sync the next run resumes from exactly where it stopped — the
 *   already-synced rows are gone and the `clientSaleId` dedupe covers any row
 *   that did reach the server just before the crash.
 *
 * Returns a summary of what succeeded and what failed.
 */
export async function syncPendingSales(): Promise<SyncResult> {
  const {
    pendingSales,
    pendingExpenses,
    setSyncStatus,
    setSyncProgress,
    removeSyncedSales,
    updateSaleError,
    removeSyncedExpenses,
    updateExpenseError,
    setLastSyncedAt,
  } = useOfflineStore.getState();

  if (pendingSales.length === 0 && pendingExpenses.length === 0) {
    setSyncProgress(null);
    return { synced: 0, failed: 0, errors: [] };
  }

  setSyncStatus('syncing');

  // Progress spans sales + expenses so the banner shows the whole sync run.
  const total = pendingSales.length + pendingExpenses.length;
  let completed = 0;
  setSyncProgress({ total, completed });

  let syncedCount = 0;
  const errors: string[] = [];

  for (const sale of pendingSales) {
    // Carry the buyer info and receipt grouping captured offline so the row
    // lands on the server with the same searchable metadata an online sale
    // would have. `clientSaleId` is the queue id — stable across retries.
    const basePayload = {
      productName: sale.productName,
      qtySold: sale.qtySold,
      salePrice: sale.salePrice,
      clientName: sale.clientName,
      clientPhone: sale.clientPhone,
      receiptId: sale.receiptId,
      clientSaleId: sale.id,
      // Preserve any quantity-discount metadata so the replayed sale records
      // the pre-discount price + reason exactly as the offline sale intended.
      ...(sale.originalUnitPrice ? { originalUnitPrice: sale.originalUnitPrice } : {}),
      ...(sale.discountReason ? { discountReason: sale.discountReason } : {}),
    };

    let lastError: unknown = null;
    let done = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
      try {
        await salesApi.record(basePayload, { timeout: SYNC_REQUEST_TIMEOUT });
        done = true;
      } catch (err) {
        // Price guard: auto-confirm since the user already set the markup
        // offline. This is a deterministic 422, not a transient failure, so
        // resolve it in-place rather than counting it as a retry attempt.
        if (isPriceGuardWarning(err)) {
          try {
            await salesApi.record(
              { ...basePayload, confirmedOverride: true },
              { timeout: SYNC_REQUEST_TIMEOUT },
            );
            done = true;
            break;
          } catch (err2) {
            if (!isRetryable(err2) || attempt === MAX_ATTEMPTS) {
              lastError = err2;
              break;
            }
            lastError = err2;
          }
        } else {
          if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
            lastError = err;
            break;
          }
          lastError = err;
        }
        // Exponential backoff with jitter before the next attempt.
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        await delay(backoff + Math.floor(Math.random() * 300));
      }
    }

    if (done) {
      // Remove immediately so the persisted queue reflects real progress and a
      // crash mid-run resumes correctly.
      removeSyncedSales([sale.id]);
      syncedCount += 1;
      completed += 1;
      setSyncProgress({ total, completed });
    } else {
      const msg = `${sale.productName}: ${getErrorMessage(lastError)}`;
      errors.push(msg);
      updateSaleError(sale.id, msg);
    }
  }

  // ── Pending expenses (owner/full-employee "normal" + mini-employee FC).
  // Retried like sales; the server dedupes on clientId (= queue id), so retries
  // never double-book. ──
  for (const exp of pendingExpenses) {
    let ok = false;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
      try {
        if (exp.kind === 'normal') {
          await expensesApi.create(
            {
              amount: exp.amount,
              currency: (exp.currency ?? 'FC') as ExpenseCurrency,
              category: exp.category as ExpenseCategory,
              description: exp.description,
              date: exp.date,
              clientId: exp.id,
            },
            { timeout: SYNC_REQUEST_TIMEOUT },
          );
        } else {
          await miniSettlementsApi.createExpense(
            {
              amount: exp.amount,
              category: exp.category,
              description: exp.description,
              clientId: exp.id,
            },
            { timeout: SYNC_REQUEST_TIMEOUT },
          );
        }
        ok = true;
      } catch (err) {
        if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
          lastError = err;
          break;
        }
        lastError = err;
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        await delay(backoff + Math.floor(Math.random() * 300));
      }
    }
    if (ok) {
      removeSyncedExpenses([exp.id]);
      syncedCount += 1;
      completed += 1;
      setSyncProgress({ total, completed });
    } else {
      const msg = `Expense: ${getErrorMessage(lastError)}`;
      errors.push(msg);
      updateExpenseError(exp.id, msg);
    }
  }

  setLastSyncedAt(new Date().toISOString());
  setSyncStatus(errors.length > 0 ? 'error' : 'idle');
  // Keep the final progress visible when everything synced (bar full); clear it
  // only when nothing is left and there were no errors.
  if (errors.length === 0) setSyncProgress(null);

  return { synced: syncedCount, failed: errors.length, errors };
}
