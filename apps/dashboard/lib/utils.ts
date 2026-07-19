import axios from 'axios';

const PIECES_PER_DOZEN = 12;

/**
 * True when the request never reached a verdict — connection failure, DNS, or
 * a client-side timeout. The server may or may not have processed it.
 *
 * Deliberately NOT a catch-all for any Error: a bug thrown in a request block
 * would otherwise be misread as a network problem.
 */
export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

/**
 * True only when the server actively rejected the caller's identity (401/403).
 *
 * This is the ONLY condition that may trigger a logout. A slow or dropped
 * connection says nothing about whether the token is valid, and treating it as
 * a rejection signs people out mid-session on a bad link — which is exactly
 * what the (main) layout used to do.
 */
export function isAuthError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

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
  const parts: string[] = [];
  if (b.cartons > 0) parts.push(`${b.cartons} ctn`);
  if (b.dozens > 0) parts.push(`${b.dozens} dz`);
  if (b.loosePieces > 0) parts.push(`${b.loosePieces} pcs`);
  if (parts.length === 0) parts.push('0 pcs');
  return `${parts.join('  ')}  (${b.totalPieces} total)`;
}

export function formatCurrency(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

export function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const e = err as { response?: { data?: { message?: string } } };
    return e.response?.data?.message ?? 'An error occurred';
  }
  if (err instanceof Error) return err.message;
  return 'An error occurred';
}
