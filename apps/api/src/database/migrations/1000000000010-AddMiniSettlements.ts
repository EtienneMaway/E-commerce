import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMiniSettlements1000000000010 implements MigrationInterface {
  name = 'AddMiniSettlements1000000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New stock-movement reasons for the mini-employee return flow. Safe to add
    // inside the migration transaction on PostgreSQL 12+ because the values are
    // not USED (inserted) until a later, separate transaction.
    await queryRunner.query(
      `ALTER TYPE "stock_movements_reason_enum" ADD VALUE IF NOT EXISTS 'CONSIGN_RETURN_IN'`,
    );
    await queryRunner.query(
      `ALTER TYPE "stock_movements_reason_enum" ADD VALUE IF NOT EXISTS 'CONSIGN_RETURN_OUT'`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "mini_settlements_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mini_settlements" (
        "id"           uuid                            NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"     uuid                            NOT NULL,
        "mini_id"      uuid                            NOT NULL,
        "status"       "mini_settlements_status_enum"  NOT NULL DEFAULT 'PENDING',
        "cash_amount"  numeric(14,4)                   NOT NULL DEFAULT '0.0000',
        "note"         varchar                         NULL,
        "payment_id"   uuid                            NULL,
        "actor_id"     uuid                            NULL,
        "created_at"   TIMESTAMP                       NOT NULL DEFAULT now(),
        "approved_at"  TIMESTAMP                       NULL,
        CONSTRAINT "pk_mini_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "fk_mini_settlements_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_mini_settlements_mini" FOREIGN KEY ("mini_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_mini_settlements_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_mini_settlements_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mini_settlements_owner_status" ON "mini_settlements" ("owner_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mini_settlements_mini" ON "mini_settlements" ("mini_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mini_settlement_items" (
        "id"                 uuid           NOT NULL DEFAULT gen_random_uuid(),
        "mini_settlement_id" uuid           NOT NULL,
        "product_name"       varchar        NOT NULL,
        "quantity"           integer        NOT NULL,
        "agreed_unit_price"  numeric(14,4)  NOT NULL,
        "unit_cost"          numeric(14,4)  NULL,
        CONSTRAINT "pk_mini_settlement_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_mini_settlement_items_settlement" FOREIGN KEY ("mini_settlement_id") REFERENCES "mini_settlements"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mini_settlement_items_settlement" ON "mini_settlement_items" ("mini_settlement_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mini_settlement_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mini_settlements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mini_settlements_status_enum"`);
    // Postgres cannot drop individual enum values; CONSIGN_RETURN_IN /
    // CONSIGN_RETURN_OUT remain on "stock_movements_reason_enum" (harmless).
  }
}
