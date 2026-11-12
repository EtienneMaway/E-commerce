import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch-to-branch stock transfers inside one business (`BRANCH_TRANSFER_PLAN.md`).
 *
 * Branch A sends goods to branch B. They leave A's shelf into escrow (the
 * transfer row and its lot draws), B receives everything or rejects everything,
 * and on receipt B owes A the carried cost. B pays back through
 * `branch_payments`, which move cash between the two branches' positions.
 *
 * **Entirely additive.** Five new tables, three new stock-movement reasons and
 * one nullable provenance column on `inventory_entries`. No existing row is
 * touched, so a business that never transfers is unaffected.
 *
 * Idempotent throughout: re-running is a no-op.
 */
export class AddBranchTransfers1000000000041 implements MigrationInterface {
  name = 'AddBranchTransfers1000000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    // ── 1. Enums ─────────────────────────────────────────────────────────────
    // Safe in the migration transaction on PostgreSQL 12+: the values are only
    // USED by later transactions (same reasoning as migration 038).
    for (const value of ['TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_RETURN_IN']) {
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
    await createEnum('branch_transfers_status_enum', ['IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED']);
    await createEnum('branch_payments_status_enum', ['PENDING', 'CONFIRMED', 'REJECTED']);
    await createEnum('branch_payments_currency_enum', ['USD', 'FC']);

    // ── 2. The transfer (the escrow) ─────────────────────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "branch_transfers" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"           uuid NOT NULL,
        "from_shop_id"     uuid NOT NULL,
        "to_shop_id"       uuid NOT NULL,
        "status"           "branch_transfers_status_enum" NOT NULL DEFAULT 'IN_TRANSIT',
        "sent_by_id"       uuid NULL,
        "answered_by_id"   uuid NULL,
        "from_custody_id"  uuid NULL,
        "to_custody_id"    uuid NULL,
        "total_value"      numeric(14,4) NOT NULL DEFAULT '0.0000',
        "note"             character varying NULL,
        "rejection_reason" character varying NULL,
        "sent_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "answered_at"      TIMESTAMP NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_transfers" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_branch_transfers_two_branches" CHECK ("from_shop_id" <> "to_shop_id")
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_transfers_from" ON "branch_transfers" ("from_shop_id", "status")`);
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_transfers_to" ON "branch_transfers" ("to_shop_id", "status")`);

    await q(`
      CREATE TABLE IF NOT EXISTS "branch_transfer_items" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transfer_id"       uuid NOT NULL,
        "product_name"      character varying NOT NULL,
        "quantity"          integer NOT NULL,
        "unit_cost"         numeric(14,4) NOT NULL,
        "variant_id"        uuid NULL,
        "variant_label"     character varying NULL,
        "pieces_per_carton" integer NULL,
        CONSTRAINT "PK_branch_transfer_items" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_branch_transfer_items_qty" CHECK ("quantity" > 0)
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_transfer_items_transfer" ON "branch_transfer_items" ("transfer_id")`);

    await q(`
      CREATE TABLE IF NOT EXISTS "branch_transfer_lot_draws" (
        "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
        "item_id"            uuid NOT NULL,
        "inventory_entry_id" uuid NOT NULL,
        "quantity"           integer NOT NULL,
        "unit_cost"          numeric(14,4) NOT NULL,
        "source"             "inventory_entries_source_enum" NOT NULL,
        CONSTRAINT "PK_branch_transfer_lot_draws" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_branch_transfer_lot_draws_qty" CHECK ("quantity" > 0)
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_transfer_lot_draws_item" ON "branch_transfer_lot_draws" ("item_id")`);

    // ── 3. The inter-branch ledger ───────────────────────────────────────────
    await q(`
      CREATE TABLE IF NOT EXISTS "branch_balances" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"           uuid NOT NULL,
        "creditor_shop_id" uuid NOT NULL,
        "debtor_shop_id"   uuid NOT NULL,
        "total_given"      numeric(14,4) NOT NULL DEFAULT '0.0000',
        "total_paid"       numeric(14,4) NOT NULL DEFAULT '0.0000',
        "outstanding"      numeric(14,4) NOT NULL DEFAULT '0.0000',
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_balances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branch_balances_pair" UNIQUE ("org_id", "creditor_shop_id", "debtor_shop_id"),
        CONSTRAINT "CHK_branch_balances_two_branches" CHECK ("creditor_shop_id" <> "debtor_shop_id")
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "branch_payments" (
        "id"                      uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"                  uuid NOT NULL,
        "balance_id"              uuid NOT NULL,
        "from_shop_id"            uuid NOT NULL,
        "to_shop_id"              uuid NOT NULL,
        "amount"                  numeric(14,4) NOT NULL,
        "currency"                "branch_payments_currency_enum" NOT NULL,
        "amount_usd"              numeric(14,4) NOT NULL,
        "usd_to_fc_rate_snapshot" numeric(14,4) NULL,
        "status"                  "branch_payments_status_enum" NOT NULL DEFAULT 'PENDING',
        "note"                    character varying NULL,
        "paid_by_id"              uuid NULL,
        "answered_by_id"          uuid NULL,
        "answered_at"             TIMESTAMP NULL,
        "created_at"              TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branch_payments" PRIMARY KEY ("id")
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_payments_balance" ON "branch_payments" ("balance_id", "status")`);
    // Cash position reads confirmed payments by branch, on each side.
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_payments_from" ON "branch_payments" ("from_shop_id") WHERE "status" = 'CONFIRMED'`);
    await q(`CREATE INDEX IF NOT EXISTS "idx_branch_payments_to" ON "branch_payments" ("to_shop_id") WHERE "status" = 'CONFIRMED'`);
    // One payment waiting per pair, the same rule paySupplier applies.
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_branch_payments_one_pending"
        ON "branch_payments" ("balance_id") WHERE "status" = 'PENDING'
    `);

    // ── 4. Provenance on the lot created at the receiving branch ─────────────
    await q(`ALTER TABLE "inventory_entries" ADD COLUMN IF NOT EXISTS "branch_transfer_id" uuid NULL`);
    await q(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_entries_branch_transfer"
        ON "inventory_entries" ("branch_transfer_id") WHERE "branch_transfer_id" IS NOT NULL
    `);

    // ── 5. Foreign keys ──────────────────────────────────────────────────────
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

    // Tenancy: both ends must be branches of the row's own business. The
    // composite FK makes a cross-business transfer impossible at the database.
    await fk('branch_transfers', 'FK_branch_transfers_from_shop_org', '"from_shop_id", "org_id"', '"shops" ("id", "org_id")');
    await fk('branch_transfers', 'FK_branch_transfers_to_shop_org', '"to_shop_id", "org_id"', '"shops" ("id", "org_id")');
    await fk('branch_balances', 'FK_branch_balances_creditor_shop_org', '"creditor_shop_id", "org_id"', '"shops" ("id", "org_id")');
    await fk('branch_balances', 'FK_branch_balances_debtor_shop_org', '"debtor_shop_id", "org_id"', '"shops" ("id", "org_id")');
    await fk('branch_payments', 'FK_branch_payments_from_shop_org', '"from_shop_id", "org_id"', '"shops" ("id", "org_id")');
    await fk('branch_payments', 'FK_branch_payments_to_shop_org', '"to_shop_id", "org_id"', '"shops" ("id", "org_id")');

    await fk('branch_transfers', 'FK_branch_transfers_sent_by', '"sent_by_id"', '"users" ("id")', 'ON DELETE SET NULL');
    await fk('branch_transfers', 'FK_branch_transfers_answered_by', '"answered_by_id"', '"users" ("id")', 'ON DELETE SET NULL');
    await fk('branch_transfers', 'FK_branch_transfers_from_custody', '"from_custody_id"', '"stock_custodies" ("id")', 'ON DELETE SET NULL');
    await fk('branch_transfers', 'FK_branch_transfers_to_custody', '"to_custody_id"', '"stock_custodies" ("id")', 'ON DELETE SET NULL');
    await fk('branch_transfer_items', 'FK_branch_transfer_items_transfer', '"transfer_id"', '"branch_transfers" ("id")', 'ON DELETE CASCADE');
    await fk('branch_transfer_lot_draws', 'FK_branch_transfer_lot_draws_item', '"item_id"', '"branch_transfer_items" ("id")', 'ON DELETE CASCADE');
    await fk('branch_transfer_lot_draws', 'FK_branch_transfer_lot_draws_entry', '"inventory_entry_id"', '"inventory_entries" ("id")', 'ON DELETE RESTRICT');
    await fk('branch_payments', 'FK_branch_payments_balance', '"balance_id"', '"branch_balances" ("id")', 'ON DELETE RESTRICT');
    await fk('branch_payments', 'FK_branch_payments_paid_by', '"paid_by_id"', '"users" ("id")', 'ON DELETE SET NULL');
    await fk('branch_payments', 'FK_branch_payments_answered_by', '"answered_by_id"', '"users" ("id")', 'ON DELETE SET NULL');
    await fk('inventory_entries', 'FK_inventory_entries_branch_transfer', '"branch_transfer_id"', '"branch_transfers" ("id")', 'ON DELETE SET NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    await q(`ALTER TABLE "inventory_entries" DROP CONSTRAINT IF EXISTS "FK_inventory_entries_branch_transfer"`);
    await q(`DROP INDEX IF EXISTS "idx_inventory_entries_branch_transfer"`);
    await q(`ALTER TABLE "inventory_entries" DROP COLUMN IF EXISTS "branch_transfer_id"`);

    for (const table of [
      'branch_payments',
      'branch_balances',
      'branch_transfer_lot_draws',
      'branch_transfer_items',
      'branch_transfers',
    ]) {
      await q(`DROP TABLE IF EXISTS "${table}"`);
    }
    for (const type of [
      'branch_payments_currency_enum',
      'branch_payments_status_enum',
      'branch_transfers_status_enum',
    ]) {
      await q(`DROP TYPE IF EXISTS "${type}"`);
    }
    // The three stock-movement values stay: Postgres cannot drop an enum value,
    // and leaving an unused one is harmless (same as migration 038).
  }
}
