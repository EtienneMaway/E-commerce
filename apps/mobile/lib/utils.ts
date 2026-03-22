/** Format a decimal string as a currency value, e.g. "1234.50" → "$1,234.50" */
export function formatCurrency(value: string | number, currency = 'USD'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num);
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
