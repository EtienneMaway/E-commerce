import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wires the sized-product model (migration 017) into the existing stock, sales,
 * consignment and settlement tables via NULLABLE columns — every existing row
 * stays untouched (all NULL = "simple product", unchanged behavior).
 *
 *  - inventory_entries  : group_id, variant_id           — which size a lot holds
 *  - sale_transactions  : variant_id, variant_label,
 *                         carton_sale_id                  — size sold + carton grouping
 *  - consignment_items  : variant_id, group_id           — size consigned to a mini
 *  - mini_settlement_items : variant_id, variant_label   — size returned on settlement
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS) so it runs cleanly on databases that
 * pre-date it.
 */
export class AddVariantRefsToInventorySalesConsignments1000000000018 implements MigrationInterface {
  name = 'AddVariantRefsToInventorySalesConsignments1000000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // inventory_entries
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" ADD COLUMN IF NOT EXISTS "group_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" ADD COLUMN IF NOT EXISTS "variant_id" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_entries_group" ON "inventory_entries" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_entries_variant" ON "inventory_entries" ("variant_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "inventory_entries"
          ADD CONSTRAINT "FK_inventory_entries_group"
            FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "inventory_entries"
          ADD CONSTRAINT "FK_inventory_entries_variant"
            FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // sale_transactions
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "variant_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "variant_label" character varying NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "carton_sale_id" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sale_transactions_carton_sale" ON "sale_transactions" ("carton_sale_id")`,
    );

    // consignment_items
    await queryRunner.query(
      `ALTER TABLE "consignment_items" ADD COLUMN IF NOT EXISTS "variant_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "consignment_items" ADD COLUMN IF NOT EXISTS "group_id" uuid NULL`,
    );

    // mini_settlement_items
    await queryRunner.query(
      `ALTER TABLE "mini_settlement_items" ADD COLUMN IF NOT EXISTS "variant_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "mini_settlement_items" ADD COLUMN IF NOT EXISTS "variant_label" character varying NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mini_settlement_items" DROP COLUMN IF EXISTS "variant_label"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mini_settlement_items" DROP COLUMN IF EXISTS "variant_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "consignment_items" DROP COLUMN IF EXISTS "group_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consignment_items" DROP COLUMN IF EXISTS "variant_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "carton_sale_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "variant_label"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "variant_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "inventory_entries" DROP CONSTRAINT IF EXISTS "FK_inventory_entries_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" DROP CONSTRAINT IF EXISTS "FK_inventory_entries_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" DROP COLUMN IF EXISTS "variant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_entries" DROP COLUMN IF EXISTS "group_id"`,
    );
  }
}
