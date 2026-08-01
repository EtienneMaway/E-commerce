import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The team a mini-employee records for themself during an open cycle — people
 * they are out selling with, added any time while they still hold goods, not
 * only at handover.
 *
 * Same lifecycle as `mini_expenses`: rows stay pending (`settlement_id` null)
 * until a handover claims them, then freeze into that settlement's
 * `team_members` snapshot. Idempotent so it replays cleanly.
 */
export class AddMiniTeamMembers1000000000025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mini_team_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "mini_id" uuid NOT NULL,
        "owner_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "phone" character varying(40),
        "settlement_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mini_team_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mini_team_members_mini"
          FOREIGN KEY ("mini_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mini_team_members_settlement"
          FOREIGN KEY ("settlement_id") REFERENCES "mini_settlements"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mini_team_members_mini" ON "mini_team_members" ("mini_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mini_team_members"`);
  }
}
