import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 of multi-shop (MULTI_SHOP_PLAN.md): organizations, shops, and the
 * tenancy columns beside every `owner_id`.
 *
 * **This migration is deliberately additive only.** It adds NULLABLE `org_id` /
 * `shop_id`, backfills them, and stops. It does not set NOT NULL, does not swap
 * the unique constraints, and does not drop `owner_id`. Migration 033, at the
 * end of Phase 4, does all three together.
 *
 * The plan originally put those three steps here. They cannot go here, and the
 * reason is worth recording:
 *
 *   - `SET NOT NULL` would reject every write made by the 22 services that still
 *     only set `owner_id` — the app would stop working the moment this ran, and
 *     stay broken until the last module of Phase 4 landed.
 *   - Swapping `UQ_product_prices_owner_product` to include a nullable `shop_id`
 *     would *weaken* it rather than extend it: PostgreSQL treats NULLs as
 *     distinct in a unique index, so rows written by unmigrated code (shop_id
 *     NULL) would no longer collide at all, silently allowing the duplicate
 *     product-price rows the constraint exists to prevent.
 *   - `DROP COLUMN owner_id` is the irreversible one, and it belongs after the
 *     code that reads it is gone, not before.
 *
 * Keeping them out preserves the property the plan is built on: phases 1-3
 * change nothing for anyone. After this migration the app behaves exactly as it
 * did before, with two extra columns nobody reads yet.
 *
 * `down()` is a development-only escape hatch.
 */
export class AddShops1000000000032 implements MigrationInterface {
  name = 'AddShops1000000000032';

  /** Every table that replaces `owner_id` with the `(org_id, shop_id)` pair. */
  private readonly ownerScoped = [
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
  ];

  /** Tables with no `owner_id` that gain the pair anyway. */
  private readonly otherScoped = ['payments', 'employments', 'salary_payments'];

  /**
   * `external_transactions.owner_id` is `character varying`; the other 33
   * person/tenancy columns in the schema are `uuid` (its entity declares
   * `@Column({ name: 'owner_id' })` with no type, so TypeORM defaulted it).
   * Joining it to `organizations.owner_user_id` without a cast fails with
   * `operator does not exist: uuid = character varying`.
   *
   * Cast here rather than alter the column: migration 033 drops `owner_id` from
   * all 17 tables at the end of Phase 4, so the inconsistency retires itself
   * and changing a live column's type buys nothing.
   */
  private ownerRef(table: string): string {
    return table === 'external_transactions' ? `t."owner_id"::uuid` : `t."owner_id"`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    // ── 1. The two new tables ────────────────────────────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_user_id" uuid NOT NULL,
        "pending_owner_user_id" uuid NULL,
        "name" character varying NOT NULL,
        "tax_id" character varying NULL,
        "logo_url" character varying NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id")
      )
    `);
    await q(
      `CREATE INDEX IF NOT EXISTS "IDX_organizations_owner_user" ON "organizations" ("owner_user_id")`,
    );

    await q(`
      CREATE TABLE IF NOT EXISTS "shops" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "address" character varying NULL,
        "phone" character varying NULL,
        "city" character varying NULL,
        "note" character varying NULL,
        "receipt_header" character varying NULL,
        "receipt_footer" character varying NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "archived_at" TIMESTAMP NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shops" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shops_org_name" UNIQUE ("org_id", "name"),
        CONSTRAINT "UQ_shops_id_org" UNIQUE ("id", "org_id")
      )
    `);
    // "Exactly one default per organization", held by the database: every
    // request without an X-Shop-Id header resolves through this row.
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shops_one_default_per_org"
        ON "shops" ("org_id") WHERE "is_default"
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "organization_ownership_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL,
        "from_user_id" uuid NULL,
        "to_user_id" uuid NOT NULL,
        "note" character varying NULL,
        "transferred_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organization_ownership_history" PRIMARY KEY ("id")
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "IDX_org_ownership_history_org"
        ON "organization_ownership_history" ("org_id", "transferred_at")
    `);

    // ── 2. Seed: one organization + one shop for EVERY user ──────────────────
    // Total, not "users with data": a user with no rows today may have rows
    // tomorrow, and totality is what lets step 4 of migration 033 set NOT NULL
    // with no fallback branch. Two rows per account is free.
    await q(`
      INSERT INTO "organizations" ("owner_user_id", "name")
      SELECT u."id", COALESCE(NULLIF(TRIM(u."name"), ''), u."username")
        FROM "users" u
       WHERE NOT EXISTS (
         SELECT 1 FROM "organizations" o WHERE o."owner_user_id" = u."id"
       )
    `);
    await q(`
      INSERT INTO "shops" ("org_id", "name", "is_default")
      SELECT o."id", 'Main Shop', true
        FROM "organizations" o
       WHERE NOT EXISTS (SELECT 1 FROM "shops" s WHERE s."org_id" = o."id")
    `);
    await q(`
      INSERT INTO "organization_ownership_history" ("org_id", "from_user_id", "to_user_id")
      SELECT o."id", NULL, o."owner_user_id"
        FROM "organizations" o
       WHERE NOT EXISTS (
         SELECT 1 FROM "organization_ownership_history" h WHERE h."org_id" = o."id"
       )
    `);

    await q(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "FK_organizations_owner_user"
        FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id")
    `);
    await q(`
      ALTER TABLE "shops"
        ADD CONSTRAINT "FK_shops_org"
        FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE
    `);
    await q(`
      ALTER TABLE "organization_ownership_history"
        ADD CONSTRAINT "FK_org_ownership_history_org"
        FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE
    `);

    // ── 3. The tenancy columns, nullable ─────────────────────────────────────
    for (const table of [...this.ownerScoped, ...this.otherScoped]) {
      await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "org_id" uuid NULL`);
      await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "shop_id" uuid NULL`);
    }
    // A role is a template belonging to the business, reusable at every branch.
    await q(`ALTER TABLE "employee_roles" ADD COLUMN IF NOT EXISTS "org_id" uuid NULL`);
    // Branch transfer proposal (§3.11.3).
    await q(`ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "pending_shop_id" uuid NULL`);
    // A consignment names two businesses, so it carries a pair per side (§3.3).
    for (const col of [
      'supplier_org_id',
      'supplier_shop_id',
      'debtor_org_id',
      'debtor_shop_id',
    ]) {
      await q(`ALTER TABLE "consignment_requests" ADD COLUMN IF NOT EXISTS "${col}" uuid NULL`);
    }

    // ── 4. Backfill ──────────────────────────────────────────────────────────
    // Every user has exactly one organization and one default shop, so this is
    // a total mapping with no fallback branch.
    const defaults = `
      "organizations" o
      JOIN "shops" s ON s."org_id" = o."id" AND s."is_default"
    `;

    for (const table of this.ownerScoped) {
      await q(`
        UPDATE "${table}" t SET "org_id" = o."id", "shop_id" = s."id"
          FROM ${defaults}
         WHERE o."owner_user_id" = ${this.ownerRef(table)} AND t."org_id" IS NULL
      `);
    }
    await q(`
      UPDATE "employee_roles" t SET "org_id" = o."id"
        FROM "organizations" o
       WHERE o."owner_user_id" = t."owner_id" AND t."org_id" IS NULL
    `);

    // employments / salary_payments have no owner_id — the employer is the
    // business. `employer_id` itself stays: it is a person, not a tenancy key.
    await q(`
      UPDATE "employments" t SET "org_id" = o."id", "shop_id" = s."id"
        FROM ${defaults}
       WHERE o."owner_user_id" = t."employer_id" AND t."org_id" IS NULL
    `);
    await q(`
      UPDATE "salary_payments" t SET "org_id" = o."id", "shop_id" = s."id"
        FROM ${defaults}
       WHERE o."owner_user_id" = t."employer_id" AND t."org_id" IS NULL
    `);

    // Payments are reached through the debt or credit they settle. Every
    // creation path in the codebase sets one of the two, but assert rather than
    // trust — see the guard after this block.
    await q(`
      UPDATE "payments" p SET "org_id" = d."org_id", "shop_id" = d."shop_id"
        FROM "supplier_debts" d
       WHERE d."id" = p."supplier_debt_id" AND p."org_id" IS NULL
    `);
    await q(`
      UPDATE "payments" p SET "org_id" = c."org_id", "shop_id" = c."shop_id"
        FROM "debtor_credits" c
       WHERE c."id" = p."debtor_credit_id" AND p."org_id" IS NULL
    `);

    // Consignments: the supplier pair is knowable for every row. The debtor
    // pair only for ACCEPTED ones — a PENDING, REJECTED or CANCELLED request
    // never had a receiving branch, and inventing one would fabricate history.
    await q(`
      UPDATE "consignment_requests" t
         SET "supplier_org_id" = o."id", "supplier_shop_id" = s."id"
        FROM ${defaults}
       WHERE o."owner_user_id" = t."supplier_id" AND t."supplier_org_id" IS NULL
    `);
    await q(`
      UPDATE "consignment_requests" t
         SET "debtor_org_id" = o."id", "debtor_shop_id" = s."id"
        FROM ${defaults}
       WHERE o."owner_user_id" = t."debtor_id"
         AND t."status" = 'ACCEPTED'
         AND t."debtor_org_id" IS NULL
    `);

    // ── 5. The mini-employee correction ──────────────────────────────────────
    // A mini holds the employer's goods on their OWN books: a CONSIGNED_IN lot
    // with owner_id = the mini. Left where the naive backfill put it, that lot
    // lands in the mini's own organization — so a mini acting for their employer
    // (org_id = employer's) would see an empty inventory and an empty handover
    // screen, and a mini who left would keep seeing those sales forever, which
    // §3.11.4 forbids. Move them to the employer's organization and shop.
    //
    // Narrower than the plan's §3.14, deliberately. Keying on `supplier_user_id`
    // alone would also move ORDINARY consignments — merchant A consigning to
    // independent merchant B (business rule 7) — into A's organization, stealing
    // B's own inventory and sales. Only lots whose owner is a mini employee of
    // that same supplier move.
    const miniLots = `
      SELECT ie."id"
        FROM "inventory_entries" ie
        JOIN "users" u ON u."id" = ie."owner_id" AND u."is_mini_employee"
        JOIN "employments" e
          ON e."employee_id" = ie."owner_id"
         AND e."employer_id" = ie."supplier_user_id"
       WHERE ie."source" = 'CONSIGNED_IN'
         AND ie."supplier_user_id" IS NOT NULL
    `;
    // The employer's default shop, via the lot's supplier.
    const employerScope = `
      "inventory_entries" lot
      JOIN ${defaults} ON o."owner_user_id" = lot."supplier_user_id"
    `;

    await q(`
      UPDATE "inventory_entries" ie SET "org_id" = o."id", "shop_id" = s."id"
        FROM ${employerScope}
       WHERE lot."id" = ie."id" AND ie."id" IN (${miniLots})
    `);
    // The sales off those lots, and their stock movements, follow the lot.
    await q(`
      UPDATE "sale_transactions" st SET "org_id" = ie."org_id", "shop_id" = ie."shop_id"
        FROM "inventory_entries" ie
       WHERE ie."id" = st."inventory_entry_id" AND ie."id" IN (${miniLots})
    `);
    await q(`
      UPDATE "stock_movements" sm SET "org_id" = ie."org_id", "shop_id" = ie."shop_id"
        FROM "inventory_entries" ie
       WHERE ie."id" = sm."inventory_entry_id" AND ie."id" IN (${miniLots})
    `);
    // mini_expenses, mini_settlements and mini_team_members need NO correction:
    // their `owner_id` is already the employer ("Employer whose books the
    // expense books against on approval"), so the naive backfill put them in the
    // right organization. The plan listed them; the entities disagree.

    // ── 6. Assert the backfill is total before anyone depends on it ──────────
    await this.assertNoOrphans(queryRunner);

    // ── 7. Composite FKs — the invariant "org_id agrees with the shop" ───────
    // MATCH SIMPLE (the default) skips the check when any column is NULL, which
    // is exactly what lets unmigrated services keep inserting rows through
    // phases 1-3.
    for (const table of [...this.ownerScoped, ...this.otherScoped]) {
      await q(`
        ALTER TABLE "${table}"
          ADD CONSTRAINT "FK_${table}_shop_org"
          FOREIGN KEY ("shop_id", "org_id") REFERENCES "shops" ("id", "org_id")
      `);
      await q(`CREATE INDEX IF NOT EXISTS "IDX_${table}_shop" ON "${table}" ("shop_id")`);
    }
    await q(`
      ALTER TABLE "employee_roles"
        ADD CONSTRAINT "FK_employee_roles_org"
        FOREIGN KEY ("org_id") REFERENCES "organizations" ("id")
    `);
    await q(`
      ALTER TABLE "employments"
        ADD CONSTRAINT "FK_employments_pending_shop"
        FOREIGN KEY ("pending_shop_id") REFERENCES "shops" ("id")
    `);
    for (const side of ['supplier', 'debtor']) {
      await q(`
        ALTER TABLE "consignment_requests"
          ADD CONSTRAINT "FK_consignment_requests_${side}_shop_org"
          FOREIGN KEY ("${side}_shop_id", "${side}_org_id") REFERENCES "shops" ("id", "org_id")
      `);
    }

    // Mirrors 1000000000021-AddHotPathIndexes.ts, which indexes
    // (owner_id, created_at) on these three. The shop-scoped queries of Phase 4
    // want the same shape.
    for (const table of ['sale_transactions', 'inventory_entries', 'stock_movements']) {
      await q(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_shop_created"
          ON "${table}" ("shop_id", "created_at")
      `);
    }
  }

  /**
   * Fails the migration loudly rather than leaving a half-scoped table behind.
   *
   * A row with no organization is invisible to every Phase 4 query — it does not
   * error, it just silently stops existing for its owner. That is the failure
   * mode this whole feature is most at risk from, so it is checked here, inside
   * the transaction, while a rollback is still free.
   */
  private async assertNoOrphans(queryRunner: QueryRunner): Promise<void> {
    const checks: { label: string; sql: string }[] = [
      ...[...this.ownerScoped].map((t) => ({
        label: `${t}.org_id`,
        sql: `SELECT count(*)::int AS n FROM "${t}" WHERE "org_id" IS NULL OR "shop_id" IS NULL`,
      })),
      {
        label: 'employee_roles.org_id',
        sql: `SELECT count(*)::int AS n FROM "employee_roles" WHERE "org_id" IS NULL`,
      },
      {
        label: 'employments.org_id',
        sql: `SELECT count(*)::int AS n FROM "employments" WHERE "org_id" IS NULL`,
      },
      {
        label: 'salary_payments.org_id',
        sql: `SELECT count(*)::int AS n FROM "salary_payments" WHERE "org_id" IS NULL`,
      },
      {
        label: 'payments.org_id',
        sql: `SELECT count(*)::int AS n FROM "payments" WHERE "org_id" IS NULL`,
      },
      {
        // The assertion the plan asks for by name: a payment that settles
        // neither a debt nor a credit has no way to reach a business.
        label: 'payments with neither supplier_debt_id nor debtor_credit_id',
        sql: `SELECT count(*)::int AS n FROM "payments"
               WHERE "supplier_debt_id" IS NULL AND "debtor_credit_id" IS NULL`,
      },
      {
        label: 'consignment_requests.supplier_org_id',
        sql: `SELECT count(*)::int AS n FROM "consignment_requests" WHERE "supplier_org_id" IS NULL`,
      },
      {
        label: 'ACCEPTED consignment_requests.debtor_org_id',
        sql: `SELECT count(*)::int AS n FROM "consignment_requests"
               WHERE "status" = 'ACCEPTED' AND "debtor_org_id" IS NULL`,
      },
      {
        label: 'users without exactly one organization',
        sql: `SELECT count(*)::int AS n FROM "users" u
               WHERE (SELECT count(*) FROM "organizations" o WHERE o."owner_user_id" = u."id") <> 1`,
      },
      {
        label: 'organizations without exactly one default shop',
        sql: `SELECT count(*)::int AS n FROM "organizations" o
               WHERE (SELECT count(*) FROM "shops" s
                       WHERE s."org_id" = o."id" AND s."is_default") <> 1`,
      },
    ];

    const failures: string[] = [];
    for (const { label, sql } of checks) {
      const rows = (await queryRunner.query(sql)) as { n: number }[];
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) failures.push(`${label}: ${n}`);
    }

    if (failures.length > 0) {
      throw new Error(
        `AddShops1000000000032 backfill is incomplete — refusing to continue.\n  ` +
          failures.join('\n  '),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    for (const side of ['supplier', 'debtor']) {
      await q(
        `ALTER TABLE "consignment_requests" DROP CONSTRAINT IF EXISTS "FK_consignment_requests_${side}_shop_org"`,
      );
      await q(`ALTER TABLE "consignment_requests" DROP COLUMN IF EXISTS "${side}_org_id"`);
      await q(`ALTER TABLE "consignment_requests" DROP COLUMN IF EXISTS "${side}_shop_id"`);
    }
    await q(`ALTER TABLE "employments" DROP CONSTRAINT IF EXISTS "FK_employments_pending_shop"`);
    await q(`ALTER TABLE "employments" DROP COLUMN IF EXISTS "pending_shop_id"`);
    await q(`ALTER TABLE "employee_roles" DROP CONSTRAINT IF EXISTS "FK_employee_roles_org"`);
    await q(`ALTER TABLE "employee_roles" DROP COLUMN IF EXISTS "org_id"`);

    for (const table of [...this.ownerScoped, ...this.otherScoped]) {
      await q(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_shop_org"`);
      await q(`DROP INDEX IF EXISTS "IDX_${table}_shop"`);
      await q(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "org_id"`);
      await q(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "shop_id"`);
    }
    for (const table of ['sale_transactions', 'inventory_entries', 'stock_movements']) {
      await q(`DROP INDEX IF EXISTS "IDX_${table}_shop_created"`);
    }

    await q(`DROP TABLE IF EXISTS "organization_ownership_history"`);
    await q(`DROP TABLE IF EXISTS "shops"`);
    await q(`DROP TABLE IF EXISTS "organizations"`);
  }
}
