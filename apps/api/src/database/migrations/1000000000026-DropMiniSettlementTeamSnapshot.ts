import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `mini_settlements.team_members` (added by migration 024).
 *
 * A handover's team is now held as `mini_team_members` rows pointing at the
 * settlement, not as a frozen jsonb blob: the owner keeps editing the list on
 * the dashboard after approval — who was actually along is often only settled
 * once the goods are back — and a mutable, owner-edited list wants real rows
 * with ids, not a read-modify-write on jsonb.
 */
export class DropMiniSettlementTeamSnapshot1000000000026 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "team_members"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "team_members" jsonb`,
    );
  }
}
