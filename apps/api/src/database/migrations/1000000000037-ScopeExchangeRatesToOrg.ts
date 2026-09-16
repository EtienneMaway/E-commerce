import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give every business its own exchange rate.
 *
 * `exchange_rates` was written before organizations existed and held ONE row
 * for the whole database: `CurrencyService.getRate()` was `find({ take: 1 })`
 * and `setRate()` updated whatever that one row was. Every account on the
 * platform therefore shared a single rate, and the last merchant to save one
 * moved every other merchant's FC display, expense ledger, withdrawal caps and
 * handover maths with it.
 *
 * After this migration the rate is keyed on `org_id`: one row per business,
 * shared by all of that business's branches (a franc is worth the same in both
 * shops, so the rate sits above the branch — MULTI_SHOP_PLAN.md §3.2).
 *
 * **Nothing is lost.** The existing global row keeps its id, its value and its
 * `updated_at`, and is simply attached to the oldest business; every other
 * business is seeded with a copy of the same figures, so every account keeps
 * reading exactly the rate it read yesterday. Only if the table somehow holds
 * more than one un-scoped row (it should hold at most one) are the extras moved
 * aside into `exchange_rates_legacy` rather than deleted — the same archive
 * habit migration 034 used for `owner_id`.
 *
 * Idempotent: every step is guarded, so a re-run is a no-op. Asserts before it
 * commits that no business is left without a rate and no rate without a
 * business.
 */
export class ScopeExchangeRatesToOrg1000000000037 implements MigrationInterface {
  name = 'ScopeExchangeRatesToOrg1000000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    await q(`ALTER TABLE "exchange_rates" ADD COLUMN IF NOT EXISTS "org_id" uuid`);

    // 1. The surviving global row keeps its identity, attached to the oldest
    //    business. Newest wins if there is somehow more than one, because that
    //    is the row `find({ take: 1 })`-era writes would have been updating.
    await q(`
      UPDATE "exchange_rates" r
         SET "org_id" = (SELECT o."id" FROM "organizations" o ORDER BY o."created_at" ASC LIMIT 1)
       WHERE r."org_id" IS NULL
         AND r."id" = (
           SELECT r2."id" FROM "exchange_rates" r2
            WHERE r2."org_id" IS NULL
            ORDER BY r2."updated_at" DESC, r2."id" ASC
            LIMIT 1
         )
         AND EXISTS (SELECT 1 FROM "organizations")
    `);

    // 2. Every other business starts from those same figures, so no merchant
    //    sees their rate change on deploy day. A business that already has a
    //    row is skipped, which is what makes this safe to re-run.
    await q(`
      INSERT INTO "exchange_rates" ("id", "org_id", "usd_to_fc_rate", "selling_rate", "updated_at")
      SELECT gen_random_uuid(), o."id", t."usd_to_fc_rate", t."selling_rate", now()
        FROM "organizations" o
        CROSS JOIN LATERAL (
          SELECT r."usd_to_fc_rate", r."selling_rate"
            FROM "exchange_rates" r
           WHERE r."org_id" IS NOT NULL
           ORDER BY r."updated_at" DESC
           LIMIT 1
        ) t
       WHERE NOT EXISTS (
         SELECT 1 FROM "exchange_rates" r2 WHERE r2."org_id" = o."id"
       )
    `);

    // 3. Any leftover un-scoped row is a duplicate of the one kept in step 1.
    //    Archived rather than dropped, so the pre-migration table is still
    //    reconstructable if a figure is ever questioned.
    await q(`
      CREATE TABLE IF NOT EXISTS "exchange_rates_legacy" (
        "id"             uuid PRIMARY KEY,
        "usd_to_fc_rate" numeric(14,4) NOT NULL,
        "selling_rate"   numeric(14,4) NULL,
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL,
        "archived_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await q(`
      INSERT INTO "exchange_rates_legacy" ("id", "usd_to_fc_rate", "selling_rate", "updated_at")
      SELECT r."id", r."usd_to_fc_rate", r."selling_rate", r."updated_at"
        FROM "exchange_rates" r
       WHERE r."org_id" IS NULL
      ON CONFLICT ("id") DO NOTHING
    `);
    await q(`DELETE FROM "exchange_rates" WHERE "org_id" IS NULL`);

    // 4. Lock the shape in.
    await q(`ALTER TABLE "exchange_rates" ALTER COLUMN "org_id" SET NOT NULL`);
    await q(`
      DO $$ BEGIN
        ALTER TABLE "exchange_rates"
          ADD CONSTRAINT "FK_exchange_rates_org"
          FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_exchange_rates_org"
        ON "exchange_rates" ("org_id")
    `);

    // 5. Refuse to commit a half-migrated table.
    const [check] = (await q(`
      SELECT
        (SELECT COUNT(*) FROM "exchange_rates" WHERE "org_id" IS NULL)          AS orphan_rates,
        (SELECT COUNT(*) FROM "organizations" o
          WHERE EXISTS (SELECT 1 FROM "exchange_rates" x WHERE x."org_id" IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM "exchange_rates" r WHERE r."org_id" = o."id")) AS orgs_without_rate
    `)) as { orphan_rates: string; orgs_without_rate: string }[];

    if (Number(check.orphan_rates) > 0 || Number(check.orgs_without_rate) > 0) {
      throw new Error(
        `ScopeExchangeRatesToOrg: refusing to commit — ${check.orphan_rates} rate row(s) ` +
          `without a business and ${check.orgs_without_rate} business(es) without a rate.`,
      );
    }
  }

  /**
   * Development-only escape hatch, like 034's. Going back means collapsing every
   * business's rate into one global row again, which cannot preserve the fact
   * that they had diverged — the first business's rate wins and the rest are
   * kept only in `exchange_rates_legacy`.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    await q(`
      INSERT INTO "exchange_rates_legacy" ("id", "usd_to_fc_rate", "selling_rate", "updated_at")
      SELECT r."id", r."usd_to_fc_rate", r."selling_rate", r."updated_at"
        FROM "exchange_rates" r
      ON CONFLICT ("id") DO NOTHING
    `);
    await q(`DROP INDEX IF EXISTS "UQ_exchange_rates_org"`);
    await q(`ALTER TABLE "exchange_rates" DROP CONSTRAINT IF EXISTS "FK_exchange_rates_org"`);
    await q(`
      DELETE FROM "exchange_rates"
       WHERE "id" NOT IN (SELECT "id" FROM "exchange_rates" ORDER BY "updated_at" DESC LIMIT 1)
    `);
    await q(`ALTER TABLE "exchange_rates" DROP COLUMN IF EXISTS "org_id"`);
  }
}
