import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMiniExpenses1000000000012 implements MigrationInterface {
  name = 'AddMiniExpenses1000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mini_expenses" (
        "id"                 uuid           NOT NULL DEFAULT gen_random_uuid(),
        "mini_id"            uuid           NOT NULL,
        "owner_id"           uuid           NOT NULL,
        "amount"             numeric(14,4)  NOT NULL,
        "category"           varchar        NOT NULL,
        "description"        varchar        NULL,
        "client_id"          varchar        NULL,
        "settlement_id"      uuid           NULL,
        "booked_expense_id"  uuid           NULL,
        "created_at"         TIMESTAMP      NOT NULL DEFAULT now(),
        CONSTRAINT "pk_mini_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "fk_mini_expenses_mini" FOREIGN KEY ("mini_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_mini_expenses_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_mini_expenses_settlement" FOREIGN KEY ("settlement_id") REFERENCES "mini_settlements"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mini_expenses_mini_settlement" ON "mini_expenses" ("mini_id", "settlement_id")`,
    );
    // Dedup key for offline sync retries (partial: only when a client id exists).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_mini_expenses_client" ON "mini_expenses" ("mini_id", "client_id") WHERE "client_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mini_expenses"`);
  }
}
