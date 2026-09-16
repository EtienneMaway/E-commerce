import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4's closing pass: make `(org_id, shop_id)` mandatory, move the unique
 * constraints onto the branch, and retire `owner_id` — where it was only ever a
 * tenancy key.
 *
 * **`owner_id` is NOT dropped everywhere, and the plan was wrong to say it
 * would be.** §3.2 called `owner_id` "a column doing two jobs", then dropped it
 * outright — which silently discards the second job on the tables where it
 * matters. A mini-employee's `CONSIGNED_IN` lot carries the *employer's*
 * `org_id`/`shop_id` (§3.14) while `owner_id` says which mini is holding it.
 * Same for the sales they make off it and the debt they owe for it. Drop that
 * column and two minis working the same branch become indistinguishable, and
 * `mini-settlements` — which asks "whose books" in six separate queries — has
 * nothing left to ask with.
 *
 * So:
 *   - tables where `owner_id` meant only "whose books"  → dropped;
 *   - tables where it also means "which person holds this" → kept, as a person
 *     key beside the tenancy pair.
 *
 * A rename to `holder_user_id` on the survivors would say this better and is
 * worth doing on its own, deliberately; it is not worth bundling into the
 * migration that also adds every NOT NULL.
 *
 * One-way door: `down()` is a development-only escape hatch.
 */
export class TightenShopTenancy1000000000034 implements MigrationInterface {
  name = 'TightenShopTenancy1000000000034';

  /** Every table carrying the tenancy pair. */
  private readonly scoped = [
    'inventory_entries',
    'stock_movements',
    'product_groups',
    'product_variants',
    'product_prices',
    'quantity_discounts',
    'sale_transactions',
    'expenses',
    'withdrawals',
    'external_transactions',
    'supplier_debts',
    'debtor_credits',
    'external_contacts',
    'mini_expenses',
    'mini_settlements',
    'mini_team_members',
    'payments',
    'employments',
    'salary_payments',
  ];

  /** `owner_id` here meant only "whose books" — the pair replaces it exactly. */
  private readonly dropOwnerId = [
    'product_groups',
    'product_variants',
    'product_prices',
    'quantity_discounts',
    'expenses',
    'withdrawals',
    'external_contacts',
    'external_transactions',
    'mini_expenses',
    'mini_settlements',
    'mini_team_members',
    'employee_roles',
  ];

  /**
   * `owner_id` here also names the PERSON holding the row, which the tenancy
   * pair cannot express: a mini's consigned stock sits at the employer's branch
   * but belongs to that mini.
   */
  private readonly keepOwnerIdAsHolder = [
    'inventory_entries',
    'sale_transactions',
    'stock_movements',
    'supplier_debts',
    'debtor_credits',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    // ── 1. Refuse to tighten over a half-scoped table ────────────────────────
    for (const table of this.scoped) {
      const rows = (await q(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "org_id" IS NULL OR "shop_id" IS NULL`,
      )) as { n: number }[];
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) {
        throw new Error(
          `TightenShopTenancy: ${table} has ${n} row(s) with no branch. ` +
            `Run migration 032's backfill before this one.`,
        );
      }
    }

    // ── 2. NOT NULL ─────────────────────────────────────────────────────────
    for (const table of this.scoped) {
      await q(`ALTER TABLE "${table}" ALTER COLUMN "org_id" SET NOT NULL`);
      await q(`ALTER TABLE "${table}" ALTER COLUMN "shop_id" SET NOT NULL`);
    }
    await q(`ALTER TABLE "employee_roles" ALTER COLUMN "org_id" SET NOT NULL`);
    // The supplier side of a consignment is known at creation; the debtor side
    // only on confirm, so it stays nullable by design (§3.3).
    await q(`ALTER TABLE "consignment_requests" ALTER COLUMN "supplier_org_id" SET NOT NULL`);
    await q(`ALTER TABLE "consignment_requests" ALTER COLUMN "supplier_shop_id" SET NOT NULL`);

    // ── 3. Unique constraints move onto the branch ──────────────────────────
    // Two branches must be able to stock the same product and owe the same
    // supplier. Business rule 3 becomes `(shop_id, counterparty)`.
    //
    // `supplier_debts` and `debtor_credits` declare bare `@Unique([...])`, so
    // what exists is a TypeORM-generated hash — look the name up rather than
    // guess it (§3.4).
    const dropUniqueOn = async (table: string, columns: string[]): Promise<void> => {
      const found = (await q(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = '${table}'::regclass AND contype = 'u'`,
      )) as { conname: string }[];
      for (const { conname } of found) {
        const cols = (await q(
          `SELECT a.attname FROM pg_constraint c
             JOIN unnest(c.conkey) k ON true
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
            WHERE c.conname = '${conname}' AND c.conrelid = '${table}'::regclass`,
        )) as { attname: string }[];
        const names = cols.map((c) => c.attname).sort();
        if (names.join(',') === [...columns].sort().join(',')) {
          await q(`ALTER TABLE "${table}" DROP CONSTRAINT "${conname}"`);
        }
      }
    };

    await dropUniqueOn('product_prices', ['owner_id', 'product_name']);
    await q(`ALTER TABLE "product_prices"
      ADD CONSTRAINT "UQ_product_prices_shop_product" UNIQUE ("shop_id", "product_name")`);

    await dropUniqueOn('product_groups', ['owner_id', 'name']);
    await q(`ALTER TABLE "product_groups"
      ADD CONSTRAINT "UQ_product_groups_shop_name" UNIQUE ("shop_id", "name")`);

    // These two keep `owner_id`: the holder is part of what makes a balance
    // unique, since a mini and their employer can both owe the same supplier
    // from the same branch.
    await dropUniqueOn('supplier_debts', ['owner_id', 'supplier_user_id']);
    await q(`ALTER TABLE "supplier_debts"
      ADD CONSTRAINT "UQ_supplier_debts_shop_owner_supplier"
      UNIQUE ("shop_id", "owner_id", "supplier_user_id")`);

    await dropUniqueOn('debtor_credits', ['owner_id', 'debtor_user_id']);
    await q(`ALTER TABLE "debtor_credits"
      ADD CONSTRAINT "UQ_debtor_credits_shop_owner_debtor"
      UNIQUE ("shop_id", "owner_id", "debtor_user_id")`);

    // ── 4. Retire owner_id where it only ever meant "whose books" ───────────
    // Archive the values first. Every one is derivable from org_id today, but a
    // production database with real merchants deserves a copy of a dropped
    // column that costs one small table. Idempotent: a re-run archives nothing
    // twice and skips tables whose column is already gone.
    await q(`
      CREATE TABLE IF NOT EXISTS "owner_id_archive" (
        "table_name" character varying NOT NULL,
        "row_id" uuid NOT NULL,
        "owner_id" character varying NOT NULL,
        "archived_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_owner_id_archive" PRIMARY KEY ("table_name", "row_id")
      )
    `);
    for (const table of this.dropOwnerId) {
      const hasColumn = (await q(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = 'owner_id'`,
      )) as unknown[];
      if (hasColumn.length === 0) continue;
      await q(`
        INSERT INTO "owner_id_archive" ("table_name", "row_id", "owner_id")
        SELECT '${table}', t."id", t."owner_id"::text FROM "${table}" t
         WHERE t."owner_id" IS NOT NULL
        ON CONFLICT DO NOTHING
      `);
    }
    for (const table of this.dropOwnerId) {
      await q(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "owner_id"`);
    }

    // ── 5. Document the survivors ───────────────────────────────────────────
    for (const table of this.keepOwnerIdAsHolder) {
      await q(`COMMENT ON COLUMN "${table}"."owner_id" IS
        'Person holding this row, NOT tenancy. Tenancy is (org_id, shop_id). A mini-employee holds consigned stock at the employer''s branch: org_id/shop_id are the employer''s, owner_id is the mini.'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    // Re-adding owner_id restores the column but not its values for rows written
    // after this migration — development only, as the header says.
    for (const table of this.dropOwnerId) {
      await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "owner_id" uuid NULL`);
      await q(`
        UPDATE "${table}" t SET "owner_id" = o."owner_user_id"
          FROM "organizations" o WHERE o."id" = t."org_id" AND t."owner_id" IS NULL
      `);
    }

    await q(`ALTER TABLE "product_prices" DROP CONSTRAINT IF EXISTS "UQ_product_prices_shop_product"`);
    await q(`ALTER TABLE "product_groups" DROP CONSTRAINT IF EXISTS "UQ_product_groups_shop_name"`);
    await q(`ALTER TABLE "supplier_debts" DROP CONSTRAINT IF EXISTS "UQ_supplier_debts_shop_owner_supplier"`);
    await q(`ALTER TABLE "debtor_credits" DROP CONSTRAINT IF EXISTS "UQ_debtor_credits_shop_owner_debtor"`);

    for (const table of this.scoped) {
      await q(`ALTER TABLE "${table}" ALTER COLUMN "org_id" DROP NOT NULL`);
      await q(`ALTER TABLE "${table}" ALTER COLUMN "shop_id" DROP NOT NULL`);
    }
    await q(`ALTER TABLE "employee_roles" ALTER COLUMN "org_id" DROP NOT NULL`);
    await q(`ALTER TABLE "consignment_requests" ALTER COLUMN "supplier_org_id" DROP NOT NULL`);
    await q(`ALTER TABLE "consignment_requests" ALTER COLUMN "supplier_shop_id" DROP NOT NULL`);
  }
}
