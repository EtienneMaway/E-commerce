import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amending a sale recorded with a wrong quantity or price, the same day it was
 * made. An amend is modelled as void + re-record in one transaction: the
 * original row is marked rejected (so every `rejected_at IS NULL` money/stock
 * filter already excludes it) and linked to the fresh corrected row(s) that
 * replace it. The two new link columns are what tell an amend apart from a
 * plain rejection and let the UI show the before/after pair.
 *
 * - `amended_at`      — when the original row was superseded by an amend.
 * - `amended_to_id`   — on the VOIDED original: the new row that replaced it.
 * - `amended_from_id` — on the NEW row: the original row it was corrected from.
 */
export class AddSaleAmendment1000000000040 implements MigrationInterface {
  name = 'AddSaleAmendment1000000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "amended_at" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "amended_from_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "amended_to_id" uuid NULL`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "sale_transactions"
          ADD CONSTRAINT "fk_sale_transactions_amended_from"
          FOREIGN KEY ("amended_from_id") REFERENCES "sale_transactions"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "sale_transactions"
          ADD CONSTRAINT "fk_sale_transactions_amended_to"
          FOREIGN KEY ("amended_to_id") REFERENCES "sale_transactions"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // Owner alert feed: "an employee amended a sale today" scans recent amends.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_transactions_owner_amended"
         ON "sale_transactions" ("owner_id", "amended_at")
         WHERE "amended_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_sale_transactions_owner_amended"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP CONSTRAINT IF EXISTS "fk_sale_transactions_amended_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP CONSTRAINT IF EXISTS "fk_sale_transactions_amended_from"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "amended_to_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "amended_from_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "amended_at"`,
    );
  }
}
