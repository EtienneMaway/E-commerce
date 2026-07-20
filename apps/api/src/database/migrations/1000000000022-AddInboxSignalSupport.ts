import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema support for the inbox-signal endpoint (`GET /sync/signal`), which
 * replaces the mobile app's four 45s "inbox" polls with one cheap check.
 *
 * The signal is DERIVED from `MAX(updated_at)` per user per channel rather than
 * from a hand-maintained counter. There are 20+ write paths across
 * mini-settlements, employments, consignments and salary-payments; a counter
 * bumped at each one means 20 sites that must each be remembered, and a missed
 * site leaves a screen silently stale forever — strictly worse than the polling
 * it replaces. Deriving is automatically correct for every existing path and
 * for any added later.
 *
 * Two things that requires:
 *
 * 1. `mini_settlements` had no `updated_at` at all — only `created_at` and
 *    `approved_at`. `approve()` sets `approved_at`, but `reject()` touched no
 *    timestamp, so a rejection was invisible to any derived stamp. That is the
 *    one event the mini most needs (it unblocks them from selling), so the
 *    column is added and backfilled from `created_at`. The other three tables
 *    already carry @UpdateDateColumn.
 *
 * 2. A composite `(user_column, updated_at DESC)` index per lookup, so each
 *    MAX() is an index-only backwards scan stopping at the first row rather
 *    than an aggregate over the user's whole history.
 *
 * Each channel is read as two subqueries (e.g. mini_id and owner_id) combined
 * with GREATEST, not `WHERE a = $1 OR b = $1` — an OR across two columns cannot
 * use either index.
 *
 * Idempotent per repo convention; safe on databases that pre-date it.
 */
export class AddInboxSignalSupport1000000000022 implements MigrationInterface {
  name = 'AddInboxSignalSupport1000000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── mini_settlements.updated_at ──
    // DEFAULT now() so existing rows land at a sane value and inserts made by
    // anything that bypasses TypeORM still populate it.
    await queryRunner.query(`
      ALTER TABLE "mini_settlements"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    // Backfill: without this every pre-existing row reads as "changed just now",
    // so every device would see one spurious invalidation on first deploy.
    // COALESCE prefers approved_at — the last real state change we know of.
    await queryRunner.query(`
      UPDATE "mini_settlements"
         SET "updated_at" = COALESCE("approved_at", "created_at")
       WHERE "updated_at" > COALESCE("approved_at", "created_at")
    `);

    // ── per-channel (user, updated_at) indexes ──
    // Each serves MAX(updated_at) WHERE <user_col> = $1 as an index-only scan.
    const indexes: ReadonlyArray<readonly [string, string, string]> = [
      ['idx_mini_settlements_mini_updated', 'mini_settlements', 'mini_id'],
      ['idx_mini_settlements_owner_updated', 'mini_settlements', 'owner_id'],
      ['idx_employments_employee_updated', 'employments', 'employee_id'],
      ['idx_employments_employer_updated', 'employments', 'employer_id'],
      [
        'idx_consignment_requests_debtor_updated',
        'consignment_requests',
        'debtor_id',
      ],
      [
        'idx_consignment_requests_supplier_updated',
        'consignment_requests',
        'supplier_id',
      ],
      [
        'idx_salary_payments_employee_updated',
        'salary_payments',
        'employee_id',
      ],
      [
        'idx_salary_payments_employer_updated',
        'salary_payments',
        'employer_id',
      ],
    ];

    for (const [name, table, column] of indexes) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "${name}"
          ON "${table}" ("${column}", "updated_at" DESC)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'idx_salary_payments_employer_updated',
      'idx_salary_payments_employee_updated',
      'idx_consignment_requests_supplier_updated',
      'idx_consignment_requests_debtor_updated',
      'idx_employments_employer_updated',
      'idx_employments_employee_updated',
      'idx_mini_settlements_owner_updated',
      'idx_mini_settlements_mini_updated',
    ];
    for (const name of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
    await queryRunner.query(`
      ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "updated_at"
    `);
  }
}
