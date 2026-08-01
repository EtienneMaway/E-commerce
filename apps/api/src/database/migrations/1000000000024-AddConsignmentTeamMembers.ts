import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional "team" attached to a consignment: the people the recipient (a mini
 * employee) will be out selling with for that batch, kept for the record until
 * the handover that closes the cycle.
 *
 * Two pieces:
 *  1. `consignment_team_members` — the live rows, tied to the consignment.
 *  2. `mini_settlements.team_members` (jsonb) — the immutable snapshot taken when
 *     the mini submits a handover, so the record of who was on the team survives
 *     on the settlement itself (same pattern as `sold_lines`).
 *
 * Idempotent so it replays cleanly on databases that pre-date it.
 */
export class AddConsignmentTeamMembers1000000000024 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consignment_team_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(120) NOT NULL,
        "phone" character varying(40),
        "consignment_request_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consignment_team_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_consignment_team_members_request"
          FOREIGN KEY ("consignment_request_id")
          REFERENCES "consignment_requests"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_consignment_team_members_request" ON "consignment_team_members" ("consignment_request_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" ADD COLUMN IF NOT EXISTS "team_members" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlements" DROP COLUMN IF EXISTS "team_members"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "consignment_team_members"`);
  }
}
