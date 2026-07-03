import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Locks each consignment's FC/USD conversion rate at give-time so a later rate
 * change never moves what a mini employee owes or the FC value of their agreement.
 *
 * Adds `usd_to_fc_rate_snapshot` to:
 *  - consignment_requests   — captured when the owner gives products.
 *  - inventory_entries       — carried onto the recipient's CONSIGNED_IN lot at confirm.
 *  - sale_transactions       — copied from the lot when a mini sells it.
 *
 * Back-fill: existing consignment rows (requests, CONSIGNED_IN lots, and sales
 * of consigned stock) are hard-set to the CURRENT system rate — per the decision
 * to freeze already-outstanding agreements at today's rate. Only touches rows
 * whose snapshot is still NULL, so re-running is safe.
 */
export class AddConsignmentRateSnapshot1000000000014 implements MigrationInterface {
  name = 'AddConsignmentRateSnapshot1000000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consignment_requests" ADD COLUMN IF NOT EXISTS "usd_to_fc_rate_snapshot" numeric(14,4) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" ADD COLUMN IF NOT EXISTS "usd_to_fc_rate_snapshot" numeric(14,4) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "usd_to_fc_rate_snapshot" numeric(14,4) NULL`,
    );

    // Freeze existing consignment agreements at the current system rate. The
    // subquery is NULL-safe: if no rate row exists yet, snapshots stay NULL and
    // the app falls back to the live rate.
    const currentRate = `(SELECT "usd_to_fc_rate" FROM "exchange_rates" ORDER BY "updated_at" DESC LIMIT 1)`;

    await queryRunner.query(
      `UPDATE "consignment_requests" SET "usd_to_fc_rate_snapshot" = ${currentRate} WHERE "usd_to_fc_rate_snapshot" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "inventory_entries" SET "usd_to_fc_rate_snapshot" = ${currentRate} WHERE "usd_to_fc_rate_snapshot" IS NULL AND "source" IN ('CONSIGNED_IN', 'CONSIGNED_OUT')`,
    );
    await queryRunner.query(
      `UPDATE "sale_transactions" SET "usd_to_fc_rate_snapshot" = ${currentRate} WHERE "usd_to_fc_rate_snapshot" IS NULL AND "source" = 'CONSIGNED_IN'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "usd_to_fc_rate_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" DROP COLUMN IF EXISTS "usd_to_fc_rate_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consignment_requests" DROP COLUMN IF EXISTS "usd_to_fc_rate_snapshot"`,
    );
  }
}
