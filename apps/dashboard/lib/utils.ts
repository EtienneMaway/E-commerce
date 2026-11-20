import axios from 'axios';
import { useLocaleStore } from '../store/locale.store';

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

/** Up to two initials for an avatar badge, from a display name or username. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/**
 * Plain-language text for failures that never reached the API (so it could
 * not translate them itself): no connection, a timeout, or a reply without a
 * message. Read from the locale store at call time — this runs outside React.
 */
interface RequestErrorText {
  readonly offline: string;
  readonly timeout: string;
  readonly generic: string;
}

const REQUEST_ERRORS: Record<'en' | 'fr', RequestErrorText> = {
  en: {
    offline: 'No connection to the server. Check your internet connection and try again.',
    timeout: 'The server is taking too long to answer. Please try again in a moment.',
    generic: 'Something went wrong. Please try again.',
  },
  fr: {
    offline: 'Pas de connexion au serveur. Vérifiez votre connexion internet et réessayez.',
    timeout: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.',
    generic: "Une erreur s'est produite. Veuillez réessayer.",
  },
};

function requestErrorText(): RequestErrorText {
  return REQUEST_ERRORS[useLocaleStore.getState().locale === 'fr' ? 'fr' : 'en'];
}

/** True for an axios failure that ran out of time rather than one that could not connect. */
export function isTimeoutError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    !error.response &&
    (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message))
  );
}

/**
 * The message to show for a failed request. Server refusals arrive already
 * translated (Accept-Language); connection problems get plain EN/FR text here
 * instead of axios's "Network Error" / "timeout of 10000ms exceeded".
 */
export function getErrorMessage(error: unknown): string {
  const text = requestErrorText();
  if (axios.isAxiosError(error)) {
    if (!error.response) return isTimeoutError(error) ? text.timeout : text.offline;
    const msg = (error.response.data as { message?: unknown } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string' && msg.length > 0) return msg;
    return text.generic;
  }
  if (error && typeof error === 'object' && 'response' in error) {
    const msg = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return text.generic;
}

/** The `code` the API put on a refusal (e.g. `EXPENSE_OVER_LIMIT`), if any. */
export function getErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

/** Matches `EXPENSE_OVER_LIMIT` in apps/api/src/common/constants.ts. */
export const EXPENSE_OVER_LIMIT = 'EXPENSE_OVER_LIMIT';

/**
 * True when the API refused a write because the dashboard is on "All branches"
 * (or somehow sent no branch at all) — `400` with `code: 'SHOP_REQUIRED'`.
 *
 * Matched on the code, never the message: the message arrives translated, so a
 * French user's refusal reads "Sélectionnez une boutique pour cette action" and
 * a sentence match would silently stop working for exactly half the users.
 */
export function isShopRequiredError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const data = error.response?.data as { code?: unknown } | undefined;
  return error.response?.status === 400 && data?.code === 'SHOP_REQUIRED';
}
