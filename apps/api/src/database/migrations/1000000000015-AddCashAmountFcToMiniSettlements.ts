import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshots the FC value of a handover's sold cash at the batches' locked rates,
 * so the owner's approval card can show a locked-rate "Net pay" (sold − expenses)
 * that never drifts with the live rate. Computed by the app at handover time
 * (Σ per sale at its lot's rate); this column just persists it.
 *
 * Back-fill: existing settlements are set to cash_amount × the current system
 * rate (best-effort — pre-dates per-batch snapshots). NULL-safe if no rate row.
 */
export class AddCashAmountFcToMiniSettlements1000000000015 implements MigrationInterface {
  name = 'AddCashAmountFcToMiniSettlements1000000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "cash_amount_fc" numeric(14,4) NULL`,
    );
    await queryRunner.query(
      `UPDATE "mini_settlements"
         SET "cash_amount_fc" = "cash_amount" * (SELECT "usd_to_fc_rate" FROM "exchange_rates" ORDER BY "updated_at" DESC LIMIT 1)
       WHERE "cash_amount_fc" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "cash_amount_fc"`,
    );
  }
}
