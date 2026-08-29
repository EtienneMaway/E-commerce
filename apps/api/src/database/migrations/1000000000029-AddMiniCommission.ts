import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional commission pay for mini employees: the employer pays a percentage
 * of the sold value of each APPROVED handover.
 *
 * - employments.commission_pct — the employer-set rate; NULL = no commission
 *   (feature is opt-in, monthly pay keeps working unchanged).
 * - mini_settlements.commission_pct — sealed from the employment at approval
 *   time, so the accrual starts with the first handover approved after the
 *   rate was set and a later change never rewrites past handovers.
 * - salary_payments.kind — MONTHLY (default, all existing rows) or COMMISSION,
 *   so commission payments don't consume the monthly budget and vice versa.
 */
export class AddMiniCommission1000000000029 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "commission_pct" numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "commission_pct" numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_payments" ADD COLUMN IF NOT EXISTS "kind" character varying(12) NOT NULL DEFAULT 'MONTHLY'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "salary_payments" DROP COLUMN IF EXISTS "kind"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "commission_pct"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employments" DROP COLUMN IF EXISTS "commission_pct"`,
    );
  }
}
