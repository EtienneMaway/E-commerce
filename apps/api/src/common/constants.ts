export const LOW_STOCK_THRESHOLD = 5;
export const OVERDUE_DAYS = 30;
export const BCRYPT_SALT_ROUNDS = 12;
export const JWT_EXPIRES_IN = '7d';

export const ACCOUNT_DELETION_GRACE_DAYS = 7;
export const ACCOUNT_DELETION_GRACE_MS =
  ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
export const ACCOUNT_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const TOMBSTONE_NAME = 'Deleted user';
