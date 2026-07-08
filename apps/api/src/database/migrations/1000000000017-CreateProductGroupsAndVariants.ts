import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the optional "sized product" model: a product group (e.g. "casserole")
 * that ships in cartons holding several sizes, each with its own cost and price.
 *
 * - product_groups   — one row per sized product (owner-scoped, unique name).
 * - product_variants — one row per size within a group (cost, price, pieces/carton).
 *
 * Simple products are unaffected — they never get a group/variant row. Stock for
 * a sized product lives in inventory_entries tagged with group_id/variant_id
 * (added in migration 018). Idempotent so it runs cleanly on pre-existing DBs.
 */
export class CreateProductGroupsAndVariants1000000000017 implements MigrationInterface {
  name = 'CreateProductGroupsAndVariants1000000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_groups" (
        "id"                   uuid              NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"             uuid              NOT NULL,
        "name"                 character varying NOT NULL,
        "category"             character varying,
        "carton_selling_price" numeric(14,4)     DEFAULT NULL,
        "archived"             boolean           NOT NULL DEFAULT false,
        "created_at"           TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_groups" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_groups_owner" ON "product_groups" ("owner_id")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "product_groups"
          ADD CONSTRAINT "UQ_product_groups_owner_name" UNIQUE ("owner_id", "name");
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "product_groups"
          ADD CONSTRAINT "FK_product_groups_owner"
            FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variants" (
        "id"                uuid              NOT NULL DEFAULT gen_random_uuid(),
        "group_id"          uuid              NOT NULL,
        "owner_id"          uuid              NOT NULL,
        "label"             character varying NOT NULL,
        "unit_cost"         numeric(14,4)     NOT NULL,
        "selling_price"     numeric(14,4)     NOT NULL,
        "pieces_per_carton" integer           NOT NULL,
        "sort_order"        integer           NOT NULL DEFAULT 0,
        "archived"          boolean           NOT NULL DEFAULT false,
        "created_at"        TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_variants" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_variants_group" ON "product_variants" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_variants_owner" ON "product_variants" ("owner_id")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "product_variants"
          ADD CONSTRAINT "UQ_product_variants_group_label" UNIQUE ("group_id", "label");
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "product_variants"
          ADD CONSTRAINT "FK_product_variants_group"
            FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_groups"`);
  }
}
