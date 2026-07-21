import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshot of the products sold in a handover cycle, stored on the settlement so
 * the mini's printable handover receipt can itemize the sales that make up the
 * cash — immutably, long after the fact. Display-only; the ledger math still
 * runs off the aggregate `cash_amount`. Nullable: pre-existing handovers have no
 * snapshot and simply omit the sold section on their receipt.
 */
export class AddSoldLinesToMiniSettlements1000000000023
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "sold_lines" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "sold_lines"`,
    );
  }
}
