import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The share of a mini employee's sales they may spend on expenses, set per
 * employment by the employer.
 *
 * Null means no ceiling, which is what every existing employment gets — the
 * feature is opt-in, so minis already recording expenses are not cut off the
 * moment this ships.
 */
export class AddMiniExpenseAllowance1000000000027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "expense_allowance_pct" numeric(5,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employments" DROP COLUMN IF EXISTS "expense_allowance_pct"`,
    );
  }
}
