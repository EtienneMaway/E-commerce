import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shop custody: making a full employee accountable for a named volume of a
 * branch's stock (`SHOP_CUSTODY_PLAN.md`).
 *
 * A mini employee is accountable today because ownership moves — goods land on
 * their books as `CONSIGNED_IN` at an agreed price and a `DebtorCredit` records
 * the debt. A full employee sells off the employer's shelf, so nothing
 * distinguishes a row they touched from a row the owner touched, and there is
 * no document saying whose hands the goods were in.
 *
 * Custody fixes that **without moving ownership**, because the goods never stop
 * being the owner's and the cost basis must not change (§3.1). So this is a
 * third axis — `inventory_entries.custodian_id` — beside tenancy
 * `(org_id, shop_id)` and holder `owner_id`. `owner_id`, `source` and
 * `unit_cost` are untouched when a lot is issued; no debt is created anywhere.
 *
 * **Entirely additive.** Every new column is nullable or defaulted, every table
 * is new, and `custodian_id IS NULL` reproduces today's behaviour exactly — a
 * branch that never appoints a custodian is byte-for-byte unaffected. Existing
 * sales are backfilled to `approval_status = 'AUTO'` so no historical row ever
 * surfaces in an approval queue.
 *
 * Idempotent throughout: re-running is a no-op.
 */
export class AddStockCustody1000000000038 implements MigrationInterface {
  name = 'AddStockCustody1000000000038';

  /** Tables carrying `(org_id, shop_id)` and therefore the composite tenancy FK. */
  private readonly scoped = [
    'stock_custodies',
    'stock_issues',
    'custody_team_members',
    'custody_handovers',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    // ── 1. Enums ─────────────────────────────────────────────────────────────
    // Safe inside the migration transaction on PostgreSQL 12+: the four
    // stock-movement values are added here and only USED by a later, separate
    // transaction. (CREATE TYPE has no such restriction — a type made in this
    // transaction may be used by the CREATE TABLEs below.)
    for (const value of ['CUSTODY_IN', 'CUSTODY_OUT', 'CUSTODY_RETURN_IN', 'CUSTODY_RETURN_OUT']) {
      await q(`ALTER TYPE "stock_movements_reason_enum" ADD VALUE IF NOT EXISTS '${value}'`);
    }

    const createEnum = async (name: string, values: readonly string[]): Promise<void> => {
      const list = values.map((v) => `'${v}'`).join(', ');
      await q(`
        DO $$ BEGIN
          CREATE TYPE "${name}" AS ENUM (${list});
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
    };

    await createEnum('stock_custodies_status_enum', ['OPEN', 'CLOSED']);
    await createEnum('stock_issues_status_enum', ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED']);
    await createEnum('custody_handovers_status_enum', ['PENDING', 'APPROVED', 'REJECTED']);
    await createEnum('custody_handover_adjustments_kind_enum', [
      'CASH_SHORT',
      'CASH_OVER',
      'ITEM_MISSING',
      'ITEM_FOUND',
      'OTHER',
    ]);
    await createEnum('sale_transactions_approval_status_enum', ['AUTO', 'PENDING', 'APPROVED']);

    // ── 2. The appointment ───────────────────────────────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "stock_custodies" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"          uuid NOT NULL,
        "shop_id"         uuid NOT NULL,
        "custodian_id"    uuid NOT NULL,
        "status"          "stock_custodies_status_enum" NOT NULL DEFAULT 'OPEN',
        "appointed_by_id" uuid NULL,
        "note"            character varying NULL,
        "opened_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "closed_at"       TIMESTAMP NULL,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_custodies" PRIMARY KEY ("id")
      )
    `);
    // "One man in charge per branch", held by the database rather than by
    // discipline — the same instinct as one default shop per organization.
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_custody_one_open_per_shop"
        ON "stock_custodies" ("shop_id") WHERE "status" = 'OPEN'
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_stock_custodies_custodian"
        ON "stock_custodies" ("custodian_id")
    `);

    // ── 3. Issuing a volume ──────────────────────────────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "stock_issues" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"           uuid NOT NULL,
        "shop_id"          uuid NOT NULL,
        "custody_id"       uuid NOT NULL,
        "status"           "stock_issues_status_enum" NOT NULL DEFAULT 'PENDING',
        "issued_by_id"     uuid NULL,
        "is_opening_sweep" boolean NOT NULL DEFAULT false,
        "note"             character varying NULL,
        "rejection_reason" character varying NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "accepted_at"      TIMESTAMP NULL,
        "rejected_at"      TIMESTAMP NULL,
        "cancelled_at"     TIMESTAMP NULL,
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_issues" PRIMARY KEY ("id")
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_stock_issues_custody"
        ON "stock_issues" ("custody_id")
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "stock_issue_items" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "issue_id"        uuid NOT NULL,
        "product_name"    character varying NOT NULL,
        "quantity"        integer NOT NULL,
        "variant_id"      uuid NULL,
        "variant_label"   character varying NULL,
        "source_entry_id" uuid NULL,
        CONSTRAINT "PK_stock_issue_items" PRIMARY KEY ("id")
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_stock_issue_items_issue"
        ON "stock_issue_items" ("issue_id")
    `);

    // ── 4. The team allowed to sell from the volume ──────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "custody_team_members" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"      uuid NOT NULL,
        "shop_id"     uuid NOT NULL,
        "custody_id"  uuid NOT NULL,
        "user_id"     uuid NOT NULL,
        "added_by_id" uuid NULL,
        "added_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "removed_at"  TIMESTAMP NULL,
        CONSTRAINT "PK_custody_team_members" PRIMARY KEY ("id")
      )
    `);
    // Someone can be on the team, be removed, and be put back — but never be on
    // it twice at once. The partial index is what makes the second true while
    // keeping the history the first needs.
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_custody_team_active"
        ON "custody_team_members" ("custody_id", "user_id") WHERE "removed_at" IS NULL
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_custody_team_members_user"
        ON "custody_team_members" ("user_id")
    `);

    // ── 5. The check ─────────────────────────────────────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "custody_handovers" (
        "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"              uuid NOT NULL,
        "shop_id"             uuid NOT NULL,
        "custody_id"          uuid NOT NULL,
        "custodian_id"        uuid NOT NULL,
        "status"              "custody_handovers_status_enum" NOT NULL DEFAULT 'PENDING',
        "period_start"        TIMESTAMP NOT NULL,
        "period_end"          TIMESTAMP NOT NULL,
        "cash_declared_fc"    numeric(14,4) NOT NULL DEFAULT '0.0000',
        "cash_expected_fc"    numeric(14,4) NOT NULL DEFAULT '0.0000',
        "mini_rollup_cash_fc" numeric(14,4) NOT NULL DEFAULT '0.0000',
        "expenses_fc"         numeric(14,4) NOT NULL DEFAULT '0.0000',
        "sold_lines"          jsonb NULL,
        "rejected_lines"      jsonb NULL,
        "mini_rollup_lines"   jsonb NULL,
        "note"                character varying NULL,
        "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "approved_at"         TIMESTAMP NULL,
        "approved_by_id"      uuid NULL,
        "rejected_at"         TIMESTAMP NULL,
        "rejection_reason"    character varying NULL,
        "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custody_handovers" PRIMARY KEY ("id")
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_custody_handovers_custody"
        ON "custody_handovers" ("custody_id")
    `);
    // Serves the owner's "handovers of all full employees" view, which filters
    // by person across branches and across appointments.
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_custody_handovers_custodian"
        ON "custody_handovers" ("custodian_id", "created_at")
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "custody_handover_items" (
        "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
        "handover_id"        uuid NOT NULL,
        "product_name"       character varying NOT NULL,
        "quantity"           integer NOT NULL,
        "unit_cost"          numeric(14,4) NOT NULL,
        "inventory_entry_id" uuid NOT NULL,
        "variant_id"         uuid NULL,
        "variant_label"      character varying NULL,
        "pieces_per_carton"  integer NULL,
        CONSTRAINT "PK_custody_handover_items" PRIMARY KEY ("id")
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_custody_handover_items_handover"
        ON "custody_handover_items" ("handover_id")
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "custody_handover_adjustments" (
        "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
        "handover_id"        uuid NOT NULL,
        "kind"               "custody_handover_adjustments_kind_enum" NOT NULL,
        "amount_fc"          numeric(14,4) NULL,
        "product_name"       character varying NULL,
        "variant_label"      character varying NULL,
        "quantity"           integer NULL,
        "inventory_entry_id" uuid NULL,
        "note"               character varying NOT NULL,
        "created_by_id"      uuid NULL,
        "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custody_handover_adjustments" PRIMARY KEY ("id")
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_custody_handover_adjustments_handover"
        ON "custody_handover_adjustments" ("handover_id")
    `);

    // ── 6. The third axis on existing tables ─────────────────────────────────
    await q(`ALTER TABLE "inventory_entries" ADD COLUMN IF NOT EXISTS "custodian_id" uuid NULL`);
    // Partial: the overwhelming majority of lots are unassigned, and every
    // custody read asks for the complement.
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_entries_custodian"
        ON "inventory_entries" ("custodian_id") WHERE "custodian_id" IS NOT NULL
    `);

    await q(`ALTER TABLE "consignment_requests" ADD COLUMN IF NOT EXISTS "custody_id" uuid NULL`);

    await q(`ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "custody_id" uuid NULL`);
    await q(`ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP NULL`);
    await q(`ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid NULL`);
    await q(`
      ALTER TABLE "sale_transactions"
        ADD COLUMN IF NOT EXISTS "approval_status"
        "sale_transactions_approval_status_enum" NOT NULL DEFAULT 'AUTO'
    `);
    // No explicit backfill: ADD COLUMN with a NOT NULL DEFAULT stamps every
    // existing row 'AUTO', which is exactly the intent — no sale that pre-dates
    // custody may ever surface in a custodian's approval queue.
    // The approval queue is a small slice of a very large table.
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_sale_transactions_pending_approval"
        ON "sale_transactions" ("custody_id") WHERE "approval_status" = 'PENDING'
    `);

    // ── 7. Foreign keys ──────────────────────────────────────────────────────
    const fk = async (
      table: string,
      name: string,
      columns: string,
      target: string,
      onDelete = '',
    ): Promise<void> => {
      await q(`
        DO $$ BEGIN
          ALTER TABLE "${table}"
            ADD CONSTRAINT "${name}" FOREIGN KEY (${columns}) REFERENCES ${target} ${onDelete};
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
    };

    // Tenancy: the composite FK that makes `org_id` and `shop_id` unable to
    // disagree (MULTI_SHOP_PLAN.md §3.2).
    for (const table of this.scoped) {
      await fk(
        table,
        `FK_${table}_shop_org`,
        '"shop_id", "org_id"',
        '"shops" ("id", "org_id")',
      );
      await q(`CREATE INDEX IF NOT EXISTS "IDX_${table}_shop" ON "${table}" ("shop_id")`);
    }

    await fk('stock_custodies', 'FK_stock_custodies_custodian', '"custodian_id"', '"users" ("id")');
    await fk('stock_custodies', 'FK_stock_custodies_appointed_by', '"appointed_by_id"', '"users" ("id")', 'ON DELETE SET NULL');

    await fk('stock_issues', 'FK_stock_issues_custody', '"custody_id"', '"stock_custodies" ("id")', 'ON DELETE CASCADE');
    await fk('stock_issues', 'FK_stock_issues_issued_by', '"issued_by_id"', '"users" ("id")', 'ON DELETE SET NULL');
    await fk('stock_issue_items', 'FK_stock_issue_items_issue', '"issue_id"', '"stock_issues" ("id")', 'ON DELETE CASCADE');

    await fk('custody_team_members', 'FK_custody_team_members_custody', '"custody_id"', '"stock_custodies" ("id")', 'ON DELETE CASCADE');
    await fk('custody_team_members', 'FK_custody_team_members_user', '"user_id"', '"users" ("id")', 'ON DELETE CASCADE');
    await fk('custody_team_members', 'FK_custody_team_members_added_by', '"added_by_id"', '"users" ("id")', 'ON DELETE SET NULL');

    await fk('custody_handovers', 'FK_custody_handovers_custody', '"custody_id"', '"stock_custodies" ("id")', 'ON DELETE CASCADE');
    await fk('custody_handovers', 'FK_custody_handovers_custodian', '"custodian_id"', '"users" ("id")');
    await fk('custody_handovers', 'FK_custody_handovers_approved_by', '"approved_by_id"', '"users" ("id")', 'ON DELETE SET NULL');

    await fk('custody_handover_items', 'FK_custody_handover_items_handover', '"handover_id"', '"custody_handovers" ("id")', 'ON DELETE CASCADE');
    await fk('custody_handover_adjustments', 'FK_custody_handover_adjustments_handover', '"handover_id"', '"custody_handovers" ("id")', 'ON DELETE CASCADE');
    await fk('custody_handover_adjustments', 'FK_custody_handover_adjustments_created_by', '"created_by_id"', '"users" ("id")', 'ON DELETE SET NULL');

    // RESTRICT, not CASCADE: a custodian's lots must not vanish with the user
    // row. Account deletion anonymises rather than destroys, and an open
    // custody blocks it outright (SHOP_CUSTODY_PLAN.md §5.4).
    await fk('inventory_entries', 'FK_inventory_entries_custodian', '"custodian_id"', '"users" ("id")');
    await fk('consignment_requests', 'FK_consignment_requests_custody', '"custody_id"', '"stock_custodies" ("id")');
    await fk('sale_transactions', 'FK_sale_transactions_custody', '"custody_id"', '"stock_custodies" ("id")');
    await fk('sale_transactions', 'FK_sale_transactions_approved_by', '"approved_by_id"', '"users" ("id")', 'ON DELETE SET NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    for (const [table, name] of [
      ['sale_transactions', 'FK_sale_transactions_approved_by'],
      ['sale_transactions', 'FK_sale_transactions_custody'],
      ['consignment_requests', 'FK_consignment_requests_custody'],
      ['inventory_entries', 'FK_inventory_entries_custodian'],
    ]) {
      await q(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`);
    }

    await q(`DROP INDEX IF EXISTS "idx_sale_transactions_pending_approval"`);
    await q(`ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "approval_status"`);
    await q(`ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "approved_by_id"`);
    await q(`ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "approved_at"`);
    await q(`ALTER TABLE "sale_transactions" DROP COLUMN IF EXISTS "custody_id"`);
    await q(`ALTER TABLE "consignment_requests" DROP COLUMN IF EXISTS "custody_id"`);
    await q(`DROP INDEX IF EXISTS "idx_inventory_entries_custodian"`);
    await q(`ALTER TABLE "inventory_entries" DROP COLUMN IF EXISTS "custodian_id"`);

    for (const table of [
      'custody_handover_adjustments',
      'custody_handover_items',
      'custody_handovers',
      'custody_team_members',
      'stock_issue_items',
      'stock_issues',
      'stock_custodies',
    ]) {
      await q(`DROP TABLE IF EXISTS "${table}"`);
    }

    for (const type of [
      'sale_transactions_approval_status_enum',
      'custody_handover_adjustments_kind_enum',
      'custody_handovers_status_enum',
      'stock_issues_status_enum',
      'stock_custodies_status_enum',
    ]) {
      await q(`DROP TYPE IF EXISTS "${type}"`);
    }

    // The four stock-movement enum values are left in place — PostgreSQL cannot
    // drop one, and any movement rows that used them are gone with the tables.
  }
}
