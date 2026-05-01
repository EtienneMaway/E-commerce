import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeesAndAuditFields1000000000002 implements MigrationInterface {
  name = 'AddEmployeesAndAuditFields1000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── users — mini employee flag ──────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "is_mini_employee" boolean NOT NULL DEFAULT false
    `);

    // ─── employments ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "employments_tier_enum" AS ENUM ('FULL', 'SALES_ONLY');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "employments_status_enum" AS ENUM (
          'PENDING', 'ACTIVE', 'REJECTED', 'TERMINATION_REQUESTED', 'TERMINATED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employments" (
        "id"                         uuid                        NOT NULL DEFAULT gen_random_uuid(),
        "employer_id"                uuid                        NOT NULL,
        "employee_id"                uuid                        NOT NULL,
        "tier"                       "employments_tier_enum"     NOT NULL,
        "status"                     "employments_status_enum"   NOT NULL,
        "termination_requested_by"   uuid,
        "created_at"                 TIMESTAMP                   NOT NULL DEFAULT now(),
        "accepted_at"                TIMESTAMP,
        "terminated_at"              TIMESTAMP,
        "updated_at"                 TIMESTAMP                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "employments"
        ADD CONSTRAINT "FK_employments_employer"
          FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "employments"
        ADD CONSTRAINT "FK_employments_employee"
          FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Lookup indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_employments_employer_status"
        ON "employments" ("employer_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_employments_employee_status"
        ON "employments" ("employee_id", "status")
    `);

    // Partial unique index — at most one open employment per employee
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_employments_employee_open"
        ON "employments" ("employee_id")
        WHERE status IN ('PENDING', 'ACTIVE', 'TERMINATION_REQUESTED')
    `);

    // ─── product_prices ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_prices" (
        "id"            uuid           NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"      uuid           NOT NULL,
        "product_name"  varchar        NOT NULL,
        "unit_price"    numeric(12,2)  NOT NULL,
        "created_at"    TIMESTAMP      NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_prices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_prices_owner_product" UNIQUE ("owner_id", "product_name")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "product_prices"
        ADD CONSTRAINT "FK_product_prices_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_prices_owner"
        ON "product_prices" ("owner_id")
    `);

    // ─── actor_id columns + FKs ──────────────────────────────────────────────
    const actorTables = [
      'sale_transactions',
      'consignment_items',
      'external_transactions',
      'payments',
      'expenses',
      'inventory_entries',
    ];

    for (const table of actorTables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "actor_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD CONSTRAINT "FK_${table}_actor"
            FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_${table}_actor_id"
          ON "${table}" ("actor_id")
      `);
    }

    // ─── original_unit_price + discount_reason on outgoing-product tables ────
    const discountTables = ['sale_transactions', 'consignment_items', 'external_transactions'];
    for (const table of discountTables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "original_unit_price" numeric(12,2)
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "discount_reason" varchar
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const discountTables = ['sale_transactions', 'consignment_items', 'external_transactions'];
    for (const table of discountTables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "discount_reason"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "original_unit_price"`);
    }

    const actorTables = [
      'sale_transactions',
      'consignment_items',
      'external_transactions',
      'payments',
      'expenses',
      'inventory_entries',
    ];
    for (const table of actorTables) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_actor_id"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_actor"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "actor_id"`);
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_prices_owner"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_prices"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "uq_employments_employee_open"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_employments_employee_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_employments_employer_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "employments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "employments_tier_enum"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_mini_employee"`);
  }
}
