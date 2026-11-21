import axios from 'axios';
import { salesApi, miniSettlementsApi, expensesApi, type RequestOverrides } from './api';
import { useOfflineStore } from '../store/offline.store';
import { useShopStore } from '../store/shop.store';
import type { PendingSale, PendingExpense, PendingRejection } from '../store/offline.store';
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
 * Request config for replaying one queued row: the slow-link timeout, plus the
 * branch the row was recorded at as `X-Shop-Id`. An explicit header beats the
 * interceptor's current selection (lib/api.ts), which is the whole point — an
 * owner who sold in branch A offline and reconnects while viewing B must see
 * that sale land in A.
 *
 * - `null` → send none: an employee, whose branch the API takes from the
 *   employment.
 * - `undefined` → a row queued by a build that predates branches. Everything
 *   then was recorded at the business's default branch, so pin that, rather
 *   than letting it drift into whichever branch is selected today.
 */
export function replayConfig(shopId: string | null | undefined): RequestOverrides {
  const pinned =
    shopId === undefined
      ? (() => {
          const { employed, defaultShopId } = useShopStore.getState();
          return employed ? null : defaultShopId;
        })()
      : shopId;
  return {
    timeout: SYNC_REQUEST_TIMEOUT,
    ...(pinned ? { headers: { 'X-Shop-Id': pinned } } : {}),
  };
}

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
 * Replays an offline rejection against a sale that now exists server-side.
 * `POST /sales/:id/reject` is idempotent, so a retry after a lost response is
 * harmless — and a rejection that fails here is NOT retried forever: the sale
 * itself is already recorded, so the queue surfaces the error instead of
 * silently leaving a voided sale standing.
 */
async function rejectServerSale(
  saleId: string,
  reason: string | undefined,
  shopId: string | null | undefined,
): Promise<{ ok: boolean; error: unknown }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await salesApi.reject(saleId, reason ? { reason } : {}, replayConfig(shopId));
      return { ok: true, error: null };
    } catch (err) {
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) return { ok: false, error: err };
      lastError = err;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      await delay(backoff + Math.floor(Math.random() * 300));
    }
  }
  return { ok: false, error: lastError };
}

/** Replays a rejection of a sale the server already had before going offline. */
async function syncOneRejection(
  rejection: PendingRejection,
): Promise<{ ok: boolean; error: unknown }> {
  return rejectServerSale(rejection.saleId, rejection.reason, rejection.shopId);
}

/**
 * A whole-carton sale is one server row per size, all sharing a `cartonSaleId`,
 * but the API answers with the first row only. Rejecting just that row would
 * leave the other sizes sold, so look the siblings up through the receipt.
 * Falls back to the one row we know when the lookup is refused (a role without
 * sales history) — better a partial void than a row stuck in the queue forever.
 */
async function cartonRowIds(
  created: unknown,
  firstId: string,
  sale: PendingSale,
): Promise<string[]> {
  const cartonSaleId =
    created && typeof created === 'object' && 'cartonSaleId' in created && typeof created.cartonSaleId === 'string'
      ? created.cartonSaleId
      : null;
  if (!cartonSaleId || !sale.receiptId) return [firstId];
  try {
    const rows: unknown = await salesApi.byReceipt(sale.receiptId, replayConfig(sale.shopId));
    if (!Array.isArray(rows)) return [firstId];
    const ids = rows
      .filter(
        (r): r is { id: string; cartonSaleId: string } =>
          !!r && typeof r === 'object' && 'id' in r && 'cartonSaleId' in r && r.cartonSaleId === cartonSaleId,
      )
      .map((r) => r.id);
    return ids.length > 0 ? ids : [firstId];
  } catch {
    return [firstId];
  }
}

/** Submits one sale, retrying transient failures and auto-confirming a price-guard 422. */
async function syncOneSale(sale: PendingSale): Promise<{ ok: boolean; error: unknown }> {
  // Carry the buyer info and receipt grouping captured offline so the row
  // lands on the server with the same searchable metadata an online sale
  // would have. `clientSaleId` is the queue id — stable across retries.
  // A sized sale replays exactly as it was made online: one size by the piece
  // (`variantId`), or whole cartons at the carton price (`carton` + `groupId` +
  // `cartonQty`, no `qtySold`). Sending a sized product by name alone is what
  // used to make these rows fail at sync.
  const shape = sale.carton
    ? {
        carton: true,
        groupId: sale.carton.groupId,
        cartonQty: sale.carton.cartonQty,
        salePrice: sale.carton.cartonPrice,
      }
    : {
        qtySold: sale.qtySold,
        salePrice: sale.salePrice,
        ...(sale.variantId ? { variantId: sale.variantId } : {}),
      };
  const basePayload = {
    productName: sale.productName,
    ...shape,
    ...(sale.salePriceFc ? { salePriceFc: sale.salePriceFc } : {}),
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

  /**
   * A sale rejected while offline is still POSTed first, then rejected: the
   * server keeps both facts, so the rejected-sales list and the handover report
   * show the correction exactly as they would had it happened online. Dropping
   * the row instead would erase a sale the customer may already hold a receipt
   * for.
   */
  const finish = async (
    created: unknown,
  ): Promise<{ ok: boolean; error: unknown }> => {
    if (!sale.rejectedOffline) return { ok: true, error: null };
    const saleId =
      created && typeof created === 'object' && 'id' in created && typeof created.id === 'string'
        ? created.id
        : null;
    if (!saleId) return { ok: true, error: null }; // nothing to reject against
    const ids = sale.carton ? await cartonRowIds(created, saleId, sale) : [saleId];
    for (const id of ids) {
      const res = await rejectServerSale(id, sale.rejectedOffline.reason, sale.shopId);
      if (!res.ok) return res;
    }
    return { ok: true, error: null };
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const created = await salesApi.record(basePayload, replayConfig(sale.shopId));
      return finish(created);
    } catch (err) {
      // Price guard: auto-confirm since the user already set the markup
      // offline. This is a deterministic 422, not a transient failure, so
      // resolve it in-place rather than counting it as a retry attempt.
      if (isPriceGuardWarning(err)) {
        try {
          const created = await salesApi.record(
            { ...basePayload, confirmedOverride: true },
            replayConfig(sale.shopId),
          );
          return finish(created);
        } catch (err2) {
          if (!isRetryable(err2) || attempt === MAX_ATTEMPTS) return { ok: false, error: err2 };
          lastError = err2;
        }
      } else {
        if (!isRetryable(err) || attempt === MAX_ATTEMPTS) return { ok: false, error: err };
        lastError = err;
      }
      // Exponential backoff with jitter before the next attempt.
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      await delay(backoff + Math.floor(Math.random() * 300));
    }
  }
  return { ok: false, error: lastError };
}

/** Submits one expense (owner/full-employee "normal" or mini-employee FC), retrying transient failures. */
async function syncOneExpense(exp: PendingExpense): Promise<{ ok: boolean; error: unknown }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
          replayConfig(exp.shopId),
        );
      } else {
        await miniSettlementsApi.createExpense(
          {
            amount: exp.amount,
            category: exp.category,
            description: exp.description,
            clientId: exp.id,
          },
          replayConfig(exp.shopId),
        );
      }
      return { ok: true, error: null };
    } catch (err) {
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) return { ok: false, error: err };
      lastError = err;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      await delay(backoff + Math.floor(Math.random() * 300));
    }
  }
  return { ok: false, error: lastError };
}

type SyncTask =
  | { type: 'sale'; recordedAt: string; sale: PendingSale }
  | { type: 'rejection'; recordedAt: string; rejection: PendingRejection }
  | { type: 'expense'; recordedAt: string; expense: PendingExpense };

/**
 * Submits all pending offline sales AND expenses to the API, in the original
 * chronological order they were recorded in — NOT "all sales, then all
 * expenses". That distinction matters for a mini employee: recording an
 * expense is gated server-side on them currently holding outstanding
 * consigned stock. If every queued sale were flushed first and happened to
 * fully sell through that stock, an expense genuinely recorded earlier
 * (while stock was still held) would be rejected for a state that only
 * exists because of sync's own ordering — not because the expense was ever
 * actually invalid. Interleaving by `recordedAt` replays events in the same
 * order they really happened, so that gate sees the same state it would
 * have online.
 *
 * - Each item is retried with backoff on transient/network errors.
 * - Sale price-guard warnings are auto-confirmed (the user already chose the
 *   markup when recording the sale offline).
 * - Synced rows are removed from the queue **incrementally**, so if the app is
 *   killed mid-sync the next run resumes from exactly where it stopped — the
 *   already-synced rows are gone and the clientSaleId/clientId dedupe covers
 *   any row that did reach the server just before the crash.
 *
 * Returns a summary of what succeeded and what failed.
 */
export async function syncPendingSales(): Promise<SyncResult> {
  const {
    pendingSales,
    pendingRejections,
    pendingExpenses,
    setSyncStatus,
    setSyncProgress,
    removeSyncedSales,
    updateSaleError,
    removeSyncedRejections,
    updateRejectionError,
    removeSyncedExpenses,
    updateExpenseError,
    setLastSyncedAt,
  } = useOfflineStore.getState();

  if (
    pendingSales.length === 0 &&
    pendingRejections.length === 0 &&
    pendingExpenses.length === 0
  ) {
    setSyncProgress(null);
    return { synced: 0, failed: 0, errors: [] };
  }

  setSyncStatus('syncing');

  const tasks: SyncTask[] = [
    ...pendingSales.map((sale) => ({ type: 'sale' as const, recordedAt: sale.recordedAt, sale })),
    // Ordered by when the REJECTION happened, so it replays after the sale it
    // voids — which for an already-synced sale is always true anyway.
    ...pendingRejections.map((rejection) => ({
      type: 'rejection' as const,
      recordedAt: rejection.recordedAt,
      rejection,
    })),
    ...pendingExpenses.map((expense) => ({ type: 'expense' as const, recordedAt: expense.recordedAt, expense })),
  ].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  const total = tasks.length;
  let completed = 0;
  setSyncProgress({ total, completed });

  let syncedCount = 0;
  const errors: string[] = [];

  for (const task of tasks) {
    if (task.type === 'sale') {
      const { sale } = task;
      const { ok, error } = await syncOneSale(sale);
      if (ok) {
        // Remove immediately so the persisted queue reflects real progress and
        // a crash mid-run resumes correctly.
        removeSyncedSales([sale.id]);
        syncedCount += 1;
        completed += 1;
        setSyncProgress({ total, completed });
      } else {
        const label = sale.variantLabel ? `${sale.productName} · ${sale.variantLabel}` : sale.productName;
        const msg = `${label}: ${getErrorMessage(error)}`;
        errors.push(msg);
        updateSaleError(sale.id, msg);
      }
    } else if (task.type === 'rejection') {
      const { rejection } = task;
      const { ok, error } = await syncOneRejection(rejection);
      if (ok) {
        removeSyncedRejections([rejection.id]);
        syncedCount += 1;
        completed += 1;
        setSyncProgress({ total, completed });
      } else {
        const msg = `${rejection.productName} (rejected): ${getErrorMessage(error)}`;
        errors.push(msg);
        updateRejectionError(rejection.id, msg);
      }
    } else {
      const { expense } = task;
      const { ok, error } = await syncOneExpense(expense);
      if (ok) {
        removeSyncedExpenses([expense.id]);
        syncedCount += 1;
        completed += 1;
        setSyncProgress({ total, completed });
      } else {
        const msg = `Expense: ${getErrorMessage(error)}`;
        errors.push(msg);
        updateExpenseError(expense.id, msg);
      }
    }
  }

  setLastSyncedAt(new Date().toISOString());
  setSyncStatus(errors.length > 0 ? 'error' : 'idle');
  // Keep the final progress visible when everything synced (bar full); clear it
  // only when nothing is left and there were no errors.
  if (errors.length === 0) setSyncProgress(null);

  return { synced: syncedCount, failed: errors.length, errors };
}
