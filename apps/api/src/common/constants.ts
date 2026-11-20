export const LOW_STOCK_THRESHOLD = 5;
export const OVERDUE_DAYS = 30;
export const BCRYPT_SALT_ROUNDS = 12;
export const JWT_EXPIRES_IN = '30d';

export const ACCOUNT_DELETION_GRACE_DAYS = 7;
export const ACCOUNT_DELETION_GRACE_MS =
  ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
export const ACCOUNT_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const TOMBSTONE_NAME = 'Deleted user';

/**
 * `code` on every "this expense is over a spending limit" refusal (profit in the
 * till, a full employee's daily allowance, a mini's round allowance). Clients
 * match the code, never the translated message, to show the limit popup.
 */
export const EXPENSE_OVER_LIMIT = 'EXPENSE_OVER_LIMIT';
