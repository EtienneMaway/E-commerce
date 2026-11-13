import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the lists and scopes the app reads on every screen.
 *
 * Indexes only — no table, column or row changes, so it is safe on production
 * data and re-runnable (`IF NOT EXISTS`).
 *
 * Two gaps:
 * 1. "All branches" filters on `org_id` alone and sorts newest first. Nothing
 *    indexed `org_id`, so that view scanned whole tables — fine with today's
 *    rows, linear in a merchant's history tomorrow.
 * 2. Single-branch lists that sort by a date column had an index on `shop_id`
 *    only (expenses, withdrawals, payments, external transactions), so
 *    Postgres fetched the branch's every row, then sorted, then took 20.
 *    `(shop_id, <date> DESC)` hands back the first page directly.
 * Plus the outgoing-consignments lookup, which filters on the supplier's
 * business/branch — columns with no index at all.
 *
 * Plain CREATE INDEX (not CONCURRENTLY): migrations run in a transaction, and
 * a small merchant's tables index in milliseconds.
 */
const INDEXES: readonly [name: string, table: string, columns: string][] = [
  // "All branches" readers.
  ['idx_sale_transactions_org_created', 'sale_transactions', '"org_id", "created_at" DESC'],
  ['idx_stock_movements_org_created', 'stock_movements', '"org_id", "created_at" DESC'],
  ['idx_inventory_entries_org_created', 'inventory_entries', '"org_id", "created_at" DESC'],
  ['idx_expenses_org_date', 'expenses', '"org_id", "date" DESC'],
  ['idx_withdrawals_org_withdrawn', 'withdrawals', '"org_id", "withdrawn_at" DESC'],
  ['idx_payments_org_created', 'payments', '"org_id", "created_at" DESC'],
  ['idx_external_transactions_org_created', 'external_transactions', '"org_id", "created_at" DESC'],
  ['idx_custody_handovers_org_created', 'custody_handovers', '"org_id", "created_at" DESC'],
  ['idx_branch_payments_org_created', 'branch_payments', '"org_id", "created_at" DESC'],

  // One branch, newest first.
  ['idx_expenses_shop_date', 'expenses', '"shop_id", "date" DESC'],
  ['idx_withdrawals_shop_withdrawn', 'withdrawals', '"shop_id", "withdrawn_at" DESC'],
  ['idx_payments_shop_created', 'payments', '"shop_id", "created_at" DESC'],
  ['idx_external_transactions_shop_created', 'external_transactions', '"shop_id", "created_at" DESC'],
  ['idx_custody_handovers_shop_created', 'custody_handovers', '"shop_id", "created_at" DESC'],

  // Consignments, both sides.
  ['idx_consignment_requests_supplier_scope', 'consignment_requests', '"supplier_org_id", "supplier_shop_id", "created_at" DESC'],
  ['idx_consignment_requests_debtor_created', 'consignment_requests', '"debtor_id", "created_at" DESC'],

  // Salary history, sorted by when it was paid.
  ['idx_salary_payments_employer_paid', 'salary_payments', '"employer_id", "paid_at" DESC'],
  ['idx_salary_payments_employee_paid', 'salary_payments', '"employee_id", "paid_at" DESC'],
];

export class AddListAndScopeIndexes1000000000043 implements MigrationInterface {
  name = 'AddListAndScopeIndexes1000000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, table, columns] of INDEXES) {
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${columns})`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
