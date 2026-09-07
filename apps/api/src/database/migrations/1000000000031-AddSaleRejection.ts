import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rejecting a sale recorded by mistake. The row is never deleted — it is
 * stamped with when/who/why, its quantity goes back on the shelf as a
 * SALE_REJECTED stock movement, and every money, stock and handover figure
 * filters on `rejected_at IS NULL`. The partial index serves the "rejected
 * sales" list, which is the only query that wants the rejected rows.
 *
 * `rejected_lines` on mini_settlements snapshots the sales a mini voided during
 * the cycle a handover settles, so the printed handover report can show them
 * long after the fact — same pattern as `sold_lines`.
 */
export class AddSaleRejection1000000000031 implements MigrationInterface {
  name = 'AddSaleRejection1000000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safe inside the migration transaction on PostgreSQL 12+: the value is
    // added here and only USED by a later, separate transaction.
    await queryRunner.query(
      `ALTER TYPE "stock_movements_reason_enum" ADD VALUE IF NOT EXISTS 'SALE_REJECTED'`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "rejected_by_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "rejection_reason" varchar NULL`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "sale_transactions"
          ADD CONSTRAINT "fk_sale_transactions_rejected_by"
          FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // Hot path: every aggregation adds `rejected_at IS NULL`, and the rejected
    // list wants exactly the complement — a partial index covers the list
    // without weighing on the (vastly larger) live-sales side.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_transactions_owner_rejected"
         ON "sale_transactions" ("owner_id", "rejected_at")
         WHERE "rejected_at" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "rejected_lines" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "rejected_lines"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_sale_transactions_owner_rejected"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP CONSTRAINT IF EXISTS "fk_sale_transactions_rejected_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "rejection_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "rejected_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "rejected_at"`,
    );
    // The enum value is left in place — PostgreSQL cannot drop one, and any
    // movement row already using it must keep resolving.
  }
}
