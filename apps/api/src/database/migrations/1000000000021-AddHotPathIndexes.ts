import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the app's hottest access paths.
 *
 * The initial schema indexed only `stock_movements`; `inventory_entries`,
 * `sale_transactions`, `payments`, `consignment_requests` and
 * `external_transactions` were created with no non-PK index at all. Every
 * dashboard aggregate, every inventory listing and every activity-feed loader
 * filters on `owner_id` and orders by a timestamp, so each one was a sequential
 * scan that grows with total history.
 *
 * All statements are `IF NOT EXISTS` per the repo convention, so this runs
 * cleanly on databases that already have some of them.
 *
 * `CONCURRENTLY` is deliberately NOT used: TypeORM wraps each migration in a
 * transaction and Postgres forbids CREATE INDEX CONCURRENTLY inside one. These
 * tables are small enough at current scale that the brief write lock is fine.
 * If they ever grow large, build the index by hand outside a transaction.
 */
export class AddHotPathIndexes1000000000021 implements MigrationInterface {
  name = 'AddHotPathIndexes1000000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── inventory_entries — the single hottest table ──
    // inventory.findAll / getProductList / dashboard.getAlerts all scan by owner.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_entries_owner_created"
        ON "inventory_entries" ("owner_id", "created_at" DESC)
    `);
    // miniStats / handoverPreview scan the mini's CONSIGNED_IN lots.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_entries_owner_source"
        ON "inventory_entries" ("owner_id", "source")
    `);
    // inventory.findAll filters productName with a case-insensitive EXACT match
    // (ILike with no wildcards), so a lower() functional index serves it.
    // NB: the `category` filter one line above it uses ILike('%…%') — a leading
    // wildcard no B-tree can serve; that needs pg_trgm and is left alone here.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_entries_owner_lower_product"
        ON "inventory_entries" ("owner_id", lower("product_name"))
    `);

    // ── sale_transactions ──
    // Serves sales.findAll, activity-logs.loadSales, every dashboard profit
    // query, and the miniStats/handoverPreview windows. NB: the entity property
    // is `date` but the COLUMN is `created_at` (@CreateDateColumn), so one index
    // covers what look like two different orderings in the service code.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_transactions_owner_created"
        ON "sale_transactions" ("owner_id", "created_at" DESC)
    `);

    // ── payments ──
    // dashboard.getCashPosition sums by recipient + direction + status.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payments_to_direction_status"
        ON "payments" ("paid_to_user_id", "direction", "status")
    `);
    // payments.getPendingFromDebtors joins on the debt and filters by status.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payments_debt_status"
        ON "payments" ("supplier_debt_id", "status")
    `);

    // ── consignment_requests ──
    // computeConsignmentProfits + getCashPosition both hit this per dashboard load.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_consignment_requests_supplier_status"
        ON "consignment_requests" ("supplier_id", "status")
    `);

    // ── external_transactions ──
    // getCashPosition / getProfitByProduct / getSummary filter owner + type.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_external_transactions_owner_type"
        ON "external_transactions" ("owner_id", "type")
    `);
    // external-contacts.listTransactions pages one contact's history.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_external_transactions_owner_contact_created"
        ON "external_transactions" ("owner_id", "contact_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'idx_external_transactions_owner_contact_created',
      'idx_external_transactions_owner_type',
      'idx_consignment_requests_supplier_status',
      'idx_payments_debt_status',
      'idx_payments_to_direction_status',
      'idx_sale_transactions_owner_created',
      'idx_inventory_entries_owner_lower_product',
      'idx_inventory_entries_owner_source',
      'idx_inventory_entries_owner_created',
    ];
    for (const name of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
