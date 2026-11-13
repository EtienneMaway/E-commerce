import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seal branch-transfer cash on a custody handover (`BRANCH_TRANSFER_PLAN.md`).
 *
 * Since migration 041 a custodian can pay another branch out of the till, or
 * confirm money arriving from one, and `cash_expected_fc` accounts for both.
 * Without the two figures on the row, anyone reading a handover later could no
 * longer explain its expected cash from its parts (sold + from minis − spent).
 *
 * Additive and idempotent. Every existing handover pre-dates branch transfers,
 * so 0 is its true value.
 */
export class AddBranchCashToCustodyHandovers1000000000042 implements MigrationInterface {
  name = 'AddBranchCashToCustodyHandovers1000000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custody_handovers" ADD COLUMN IF NOT EXISTS "branch_paid_out_fc" numeric(14,4) NOT NULL DEFAULT '0.0000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "custody_handovers" ADD COLUMN IF NOT EXISTS "branch_received_fc" numeric(14,4) NOT NULL DEFAULT '0.0000'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "custody_handovers" DROP COLUMN IF EXISTS "branch_received_fc"`);
    await queryRunner.query(`ALTER TABLE "custody_handovers" DROP COLUMN IF EXISTS "branch_paid_out_fc"`);
  }
}
