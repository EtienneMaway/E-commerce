import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quantity ("group of prices") discounts. One config row per owner holding the
 * shop-wide percentages for the three quantity tiers (half dozen / dozen /
 * carton) plus a master enable switch. No changes to existing tables — a
 * discounted sale reuses `sale_transactions.original_unit_price` +
 * `discount_reason`, so nothing here touches sales.
 *
 * Idempotent so it runs cleanly on databases that pre-date it.
 */
export class AddQuantityDiscounts1000000000020 implements MigrationInterface {
  name = 'AddQuantityDiscounts1000000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quantity_discounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "half_dozen_percent" numeric(6,2) NOT NULL DEFAULT '0.00',
        "dozen_percent" numeric(6,2) NOT NULL DEFAULT '0.00',
        "carton_percent" numeric(6,2) NOT NULL DEFAULT '0.00',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quantity_discounts" PRIMARY KEY ("id")
      )
    `);

    // One config per owner.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_quantity_discounts_owner_id"
      ON "quantity_discounts" ("owner_id")
    `);

    // FK to users — cascade delete so removing an owner cleans up their config.
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE "quantity_discounts"
          ADD CONSTRAINT "FK_quantity_discounts_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id")
          ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quantity_discounts" DROP CONSTRAINT IF EXISTS "FK_quantity_discounts_owner"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_quantity_discounts_owner_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "quantity_discounts"`);
  }
}
