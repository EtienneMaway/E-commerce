import axios from 'axios';

const PIECES_PER_DOZEN = 12;

export interface QuantityBreakdown {
  cartons: number;
  dozens: number;
  loosePieces: number;
  totalPieces: number;
  piecesPerCarton: number | null;
}

export function breakdownQuantity(totalPieces: number, piecesPerCarton: number | null): QuantityBreakdown {
  if (!piecesPerCarton) {
    return { cartons: 0, dozens: 0, loosePieces: totalPieces, totalPieces, piecesPerCarton: null };
  }
  const cartons = Math.floor(totalPieces / piecesPerCarton);
  const remainder = totalPieces % piecesPerCarton;
  const dozens = Math.floor(remainder / PIECES_PER_DOZEN);
  const loosePieces = remainder % PIECES_PER_DOZEN;
  return { cartons, dozens, loosePieces, totalPieces, piecesPerCarton };
}

export function formatBreakdown(b: QuantityBreakdown): string {
  if (!b.piecesPerCarton) return `${b.totalPieces} pcs`;
  // When piecesPerCarton is set, always render all three components — even
  // zero ones — so the merchant sees at a glance how the total decomposes.
  // Prior behaviour hid zeros and made it ambiguous whether an exact-cartons
  // count had any leftover pieces or not.
  const parts = [
    `${b.cartons} ctn`,
    `${b.dozens} dz`,
    `${b.loosePieces} pcs`,
  ];
  return `${parts.join(' · ')}  (${b.totalPieces} pcs total)`;
}

/** Format a decimal string as a currency value, e.g. "1234.5057" → "$1,234.5057".
 * Default precision is 4dp; pass `dp` (e.g. 2) for compact card displays. Values
 * are TRUNCATED to the requested precision so we never overstate the amount.
 */
export function formatCurrency(
  value: string | number,
  currency = 'USD',
  dp = 4,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  const factor = Math.pow(10, dp);
  const truncated = Math.trunc(num * factor) / factor;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(truncated);
}

/** Format an ISO date string as a readable date, e.g. "2025-01-15T10:30:00.000Z" → "Jan 15, 2025" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Format an ISO date string with time, e.g. "Jan 15, 2025, 10:30 AM" */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Return "2 days ago", "just now", etc. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Parse API error messages into a user-friendly string */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { data?: { message?: string | string[] } } }).response;
    const msg = resp?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

/**
 * True when the request never got a verdict from the server — connection
 * failure, DNS, or a client-side timeout. The defining property is that the
 * server MAY have processed it: a timeout says nothing about whether the write
 * landed. Callers must therefore replay with a stable idempotency key rather
 * than assume the operation did not happen.
 *
 * Distinct from a definite server rejection (any 4xx/5xx), which carries a
 * `response` and means the request was received and judged.
 */
export function isNetworkError(error: unknown): boolean {
  // Must be an axios failure with no response. Deliberately NOT a catch-all for
  // any Error: a programming bug thrown inside the request block would other-
  // wise be misread as "the network dropped" and silently queued as a sale.
  return axios.isAxiosError(error) && !error.response;
}

/**
 * True only when the server actively rejected the caller's identity (401/403).
 * The one condition that should stop a retry loop or end a session — a dropped
 * connection says nothing about whether the token is valid.
 */
export function isAuthError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

/** Check if an API error is a price guard warning (HTTP 422) */
export function isPriceGuardWarning(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { status?: number; data?: { warning?: boolean } } }).response;
    return resp?.status === 422 && resp?.data?.warning === true;
  }
  return false;
}

/** Extract price guard warning body from error */
export function getPriceGuardWarning(error: unknown): {
  costPrice: string; potentialLoss: string; message: string;
} | null {
  if (isPriceGuardWarning(error)) {
    const resp = (error as { response: { data: { costPrice: string; potentialLoss: string; message: string } } }).response;
    return resp.data;
  }
  return null;
}

/** Check if a sale was rejected because an employee tried to discount below the owner's standard price (HTTP 422). */
export function isDiscountReasonRequired(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { status?: number; data?: { error?: string } } }).response;
    return resp?.status === 422 && resp?.data?.error === 'DISCOUNT_REASON_REQUIRED';
  }
  return false;
}

/** Extract the standard price + submitted price from a DISCOUNT_REASON_REQUIRED 422. */
export function getDiscountReasonInfo(error: unknown): {
  standardPrice: string;
  submittedPrice: string;
} | null {
  if (isDiscountReasonRequired(error)) {
    const resp = (error as {
      response: { data: { standardPrice: string; submittedPrice: string } };
    }).response;
    return { standardPrice: resp.data.standardPrice, submittedPrice: resp.data.submittedPrice };
  }
  return null;
}

/** Check if a login error means the account is in its soft-delete grace window (HTTP 410). */
export function isPendingDeletionError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { status?: number; data?: { pendingDeletion?: boolean } } }).response;
    return resp?.status === 410 && resp?.data?.pendingDeletion === true;
  }
  return false;
}

/** Extract the pending-deletion payload from a login 410 response. */
export function getPendingDeletion(error: unknown): {
  deletedAt: string;
  expiresAt: string;
} | null {
  if (isPendingDeletionError(error)) {
    const resp = (error as { response: { data: { deletedAt: string; expiresAt: string } } }).response;
    return { deletedAt: resp.data.deletedAt, expiresAt: resp.data.expiresAt };
  }
  return null;
}
