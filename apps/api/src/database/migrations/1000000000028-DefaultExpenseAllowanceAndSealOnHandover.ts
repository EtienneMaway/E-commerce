import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two related changes to the mini expense ceiling.
 *
 * 1. It always applies now, defaulting to 2%. Previously null meant "no ceiling"
 *    and every employment started that way; existing rows are backfilled to 2%
 *    so nobody is left unlimited. An employer wanting effectively no limit sets
 *    a high percentage rather than clearing the field.
 *
 * 2. `mini_settlements.expense_allowance_pct` seals the percentage in force when
 *    a handover was submitted, so changing the employment's rate later never
 *    rewrites what an old handover was governed by. Nullable: handovers that
 *    pre-date this simply have no sealed rate to show.
 */
export class DefaultExpenseAllowanceAndSealOnHandover1000000000028
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "employments" SET "expense_allowance_pct" = 2.00 WHERE "expense_allowance_pct" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employments" ALTER COLUMN "expense_allowance_pct" SET DEFAULT 2.00`,
    );
    await queryRunner.query(
      `ALTER TABLE "employments" ALTER COLUMN "expense_allowance_pct" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "expense_allowance_pct" numeric(5,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "expense_allowance_pct"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employments" ALTER COLUMN "expense_allowance_pct" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employments" ALTER COLUMN "expense_allowance_pct" DROP DEFAULT`,
    );
  }
}
