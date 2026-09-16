import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two indexes that went out with `owner_id` in migration 034 and need a home on
 * the new keys.
 *
 * Dropping a column drops its indexes with it, silently. `schema:log` caught
 * both: `employee_roles` lost the lookup its own service filters on every
 * request, and `quantity_discounts` lost the uniqueness that keeps one config
 * per set of books — which now means per **branch**, not per business, or a
 * merchant could never price a discount differently at a second shop.
 */
export class ShopIndexesAfterOwnerDrop1000000000035 implements MigrationInterface {
  name = 'ShopIndexesAfterOwnerDrop1000000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_employee_roles_org" ON "employee_roles" ("org_id")`,
    );
    // Refuse, never delete. Before branches this table was one row per owner, so
    // one row per default shop — duplicates should not exist. If a production
    // database proves otherwise, stop the deploy and let a person choose which
    // configuration to keep; silently dropping a merchant's discount settings is
    // not a migration's call.
    const dupes = (await queryRunner.query(`
      SELECT count(*)::int AS n FROM (
        SELECT "shop_id" FROM "quantity_discounts" GROUP BY "shop_id" HAVING count(*) > 1
      ) d
    `)) as { n: number }[];
    if (Number(dupes[0]?.n ?? 0) > 0) {
      throw new Error(
        `ShopIndexesAfterOwnerDrop1000000000035: ${dupes[0].n} branch(es) have more than one ` +
          `quantity_discounts row. Resolve them by hand before migrating; nothing was changed.`,
      );
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_quantity_discounts_shop" ON "quantity_discounts" ("shop_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_quantity_discounts_shop"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_employee_roles_org"`);
  }
}
