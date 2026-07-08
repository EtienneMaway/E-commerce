import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves cost onto the carton: a sized product now has a carton buying price
 * (its cost) at the group level, and each size's own cost becomes optional
 * (derived by splitting the carton buying price across sizes by selling-price
 * share). Idempotent so it runs cleanly on databases that pre-date it.
 *
 *  - product_groups.carton_buying_price  — cost of one whole carton (nullable).
 *  - product_variants.unit_cost          — now NULLABLE (was NOT NULL).
 */
export class AddCartonBuyingPriceAndNullableVariantCost1000000000019
  implements MigrationInterface
{
  name = 'AddCartonBuyingPriceAndNullableVariantCost1000000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_groups" ADD COLUMN IF NOT EXISTS "carton_buying_price" numeric(14,4) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ALTER COLUMN "unit_cost" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfill any nulls before restoring NOT NULL so the constraint can apply.
    await queryRunner.query(
      `UPDATE "product_variants" SET "unit_cost" = '0.0000' WHERE "unit_cost" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ALTER COLUMN "unit_cost" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_groups" DROP COLUMN IF EXISTS "carton_buying_price"`,
    );
  }
}
