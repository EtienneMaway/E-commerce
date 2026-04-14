import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1000000000000 implements MigrationInterface {
  name = 'InitialSchema1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------ users
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"            uuid              NOT NULL DEFAULT gen_random_uuid(),
        "username"      character varying NOT NULL,
        "email"         character varying,
        "phone"         character varying,
        "password_hash" character varying NOT NULL,
        "created_at"    TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "UQ_users_email"    UNIQUE ("email"),
        CONSTRAINT "UQ_users_phone"    UNIQUE ("phone"),
        CONSTRAINT "PK_users"          PRIMARY KEY ("id")
      )
    `);

    // --------------------------------------------------------- supplier_debts
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "supplier_debts" (
        "id"                   uuid             NOT NULL DEFAULT gen_random_uuid(),
        "total_credit_received" numeric(12,2)   NOT NULL DEFAULT '0.00',
        "total_paid"           numeric(12,2)    NOT NULL DEFAULT '0.00',
        "outstanding_balance"  numeric(12,2)    NOT NULL DEFAULT '0.00',
        "created_at"           TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMP        NOT NULL DEFAULT now(),
        "owner_id"             character varying NOT NULL,
        "supplier_user_id"     character varying NOT NULL,
        CONSTRAINT "UQ_supplier_debts_owner_supplier" UNIQUE ("owner_id", "supplier_user_id"),
        CONSTRAINT "PK_supplier_debts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_debts"
        ADD CONSTRAINT "FK_supplier_debts_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_supplier_debts_supplier"
          FOREIGN KEY ("supplier_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ---------------------------------------------------------- debtor_credits
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debtor_credits" (
        "id"                 uuid             NOT NULL DEFAULT gen_random_uuid(),
        "total_credit_given" numeric(12,2)    NOT NULL DEFAULT '0.00',
        "total_received"     numeric(12,2)    NOT NULL DEFAULT '0.00',
        "outstanding_balance" numeric(12,2)   NOT NULL DEFAULT '0.00',
        "created_at"         TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP        NOT NULL DEFAULT now(),
        "owner_id"           character varying NOT NULL,
        "debtor_user_id"     character varying NOT NULL,
        CONSTRAINT "UQ_debtor_credits_owner_debtor" UNIQUE ("owner_id", "debtor_user_id"),
        CONSTRAINT "PK_debtor_credits" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "debtor_credits"
        ADD CONSTRAINT "FK_debtor_credits_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_debtor_credits_debtor"
          FOREIGN KEY ("debtor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ------------------------------------------------------- inventory_entries
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "inventory_entries_source_enum" AS ENUM (
          'PERSONAL', 'SUPPLIER', 'CONSIGNED_OUT', 'CONSIGNED_IN'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_entries" (
        "id"                uuid             NOT NULL DEFAULT gen_random_uuid(),
        "source"            "inventory_entries_source_enum" NOT NULL,
        "product_name"      character varying NOT NULL,
        "unit_cost"         numeric(12,2)    NOT NULL,
        "selling_price"     numeric(12,2)    NOT NULL,
        "category"          character varying,
        "quantity_original" integer          NOT NULL,
        "quantity_remaining" integer         NOT NULL,
        "carton_price"      numeric(12,2)    DEFAULT NULL,
        "pieces_per_carton" integer          DEFAULT NULL,
        "created_at"        TIMESTAMP        NOT NULL DEFAULT now(),
        "owner_id"          character varying NOT NULL,
        "supplier_user_id"  uuid,
        "debtor_user_id"    character varying,
        "supplier_debt_id"  character varying,
        "debtor_credit_id"  character varying,
        CONSTRAINT "PK_inventory_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_entries"
        ADD CONSTRAINT "FK_inventory_entries_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_inventory_entries_supplier_user"
          FOREIGN KEY ("supplier_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_inventory_entries_debtor_user"
          FOREIGN KEY ("debtor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_inventory_entries_supplier_debt"
          FOREIGN KEY ("supplier_debt_id") REFERENCES "supplier_debts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_inventory_entries_debtor_credit"
          FOREIGN KEY ("debtor_credit_id") REFERENCES "debtor_credits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ---------------------------------------------------------------- payments
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payments_direction_enum" AS ENUM (
          'OWNER_TO_SUPPLIER', 'DEBTOR_TO_OWNER'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payments_status_enum" AS ENUM (
          'PENDING', 'APPROVED', 'REJECTED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id"                uuid             NOT NULL DEFAULT gen_random_uuid(),
        "amount"            numeric(12,2)    NOT NULL,
        "note"              character varying,
        "created_at"        TIMESTAMP        NOT NULL DEFAULT now(),
        "direction"         "payments_direction_enum" NOT NULL,
        "status"            "payments_status_enum"    NOT NULL DEFAULT 'PENDING',
        "remaining_balance" numeric(12,2),
        "paid_by_user_id"   character varying,
        "paid_to_user_id"   character varying,
        "supplier_debt_id"  character varying,
        "debtor_credit_id"  character varying,
        CONSTRAINT "PK_payments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "FK_payments_paid_by"
          FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_payments_paid_to"
          FOREIGN KEY ("paid_to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_payments_supplier_debt"
          FOREIGN KEY ("supplier_debt_id") REFERENCES "supplier_debts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_payments_debtor_credit"
          FOREIGN KEY ("debtor_credit_id") REFERENCES "debtor_credits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ---------------------------------------------------- sale_transactions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_transactions" (
        "id"                 uuid             NOT NULL DEFAULT gen_random_uuid(),
        "product_name"       character varying NOT NULL,
        "source"             character varying NOT NULL,
        "supplier_user_id"   uuid,
        "qty_sold"           integer          NOT NULL,
        "unit_cost"          numeric(12,2)    NOT NULL,
        "sale_price"         numeric(12,2)    NOT NULL,
        "profit"             numeric(12,2)    NOT NULL,
        "is_loss"            boolean          NOT NULL DEFAULT false,
        "created_at"         TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP        NOT NULL DEFAULT now(),
        "owner_id"           character varying NOT NULL,
        "inventory_entry_id" character varying NOT NULL,
        CONSTRAINT "PK_sale_transactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "sale_transactions"
        ADD CONSTRAINT "FK_sale_transactions_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_sale_transactions_inventory_entry"
          FOREIGN KEY ("inventory_entry_id") REFERENCES "inventory_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ------------------------------------------------- consignment_requests
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "consignment_requests_status_enum" AS ENUM (
          'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consignment_requests" (
        "id"           uuid             NOT NULL DEFAULT gen_random_uuid(),
        "status"       "consignment_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "note"         character varying,
        "confirmed_at" TIMESTAMP,
        "created_at"   TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP        NOT NULL DEFAULT now(),
        "supplier_id"  character varying NOT NULL,
        "debtor_id"    character varying NOT NULL,
        CONSTRAINT "PK_consignment_requests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "consignment_requests"
        ADD CONSTRAINT "FK_consignment_requests_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_consignment_requests_debtor"
          FOREIGN KEY ("debtor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // --------------------------------------------------- consignment_items
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consignment_items" (
        "id"                     uuid             NOT NULL DEFAULT gen_random_uuid(),
        "product_name"           character varying NOT NULL,
        "quantity"               integer          NOT NULL,
        "agreed_unit_price"      numeric(12,2)    NOT NULL,
        "unit_cost"              numeric(12,2)    NOT NULL,
        "consignment_request_id" character varying NOT NULL,
        CONSTRAINT "PK_consignment_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "consignment_items"
        ADD CONSTRAINT "FK_consignment_items_request"
          FOREIGN KEY ("consignment_request_id") REFERENCES "consignment_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // -------------------------------------------------------- exchange_rates
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exchange_rates" (
        "id"            uuid          NOT NULL DEFAULT gen_random_uuid(),
        "usd_to_fc_rate" numeric(14,4) NOT NULL,
        "selling_rate"  numeric(14,4) DEFAULT NULL,
        "updated_at"    TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exchange_rates" PRIMARY KEY ("id")
      )
    `);

    // ----------------------------------------------------- external_contacts
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "external_contacts_role_enum" AS ENUM (
          'DEBTOR', 'SUPPLIER', 'BOTH'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_contacts" (
        "id"               uuid             NOT NULL DEFAULT gen_random_uuid(),
        "name"             character varying NOT NULL,
        "phone"            character varying,
        "notes"            character varying,
        "role"             "external_contacts_role_enum" NOT NULL DEFAULT 'DEBTOR',
        "debtor_balance"   numeric(12,2)    NOT NULL DEFAULT '0.00',
        "supplier_balance" numeric(12,2)    NOT NULL DEFAULT '0.00',
        "owner_id"         character varying NOT NULL,
        "created_at"       TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_contacts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "external_contacts"
        ADD CONSTRAINT "FK_external_contacts_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ------------------------------------------------- external_transactions
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "external_transactions_type_enum" AS ENUM (
          'PRODUCT_OUT', 'PAYMENT_IN', 'PRODUCT_IN', 'PAYMENT_OUT'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_transactions" (
        "id"            uuid             NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"      character varying NOT NULL,
        "contact_id"    character varying NOT NULL,
        "type"          "external_transactions_type_enum" NOT NULL,
        "product_name"  character varying,
        "quantity"      integer,
        "unit_price"    numeric(12,2),
        "amount"        numeric(12,2)    NOT NULL,
        "unit_cost_used" numeric(12,2),
        "profit"        numeric(12,2),
        "is_loss"       boolean,
        "notes"         character varying,
        "created_at"    TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_transactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "external_transactions"
        ADD CONSTRAINT "FK_external_transactions_contact"
          FOREIGN KEY ("contact_id") REFERENCES "external_contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ------------------------------------------------------- stock_movements
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_movements_reason_enum" AS ENUM (
          'PURCHASE',
          'RECEIVE_SUPPLIER',
          'CUSTOMER_RETURN',
          'RECOUNT_UP',
          'OTHER_IN',
          'EXTERNAL_IN',
          'SALE',
          'CONSIGN_OUT',
          'EXTERNAL_OUT',
          'DAMAGE',
          'LOSS',
          'THEFT',
          'EXPIRY',
          'SUPPLIER_RETURN',
          'INTERNAL_USE',
          'RECOUNT_DOWN',
          'OTHER_OUT'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movements" (
        "id"                     uuid          NOT NULL DEFAULT gen_random_uuid(),
        "inventory_entry_id"     uuid          NOT NULL,
        "owner_id"               uuid          NOT NULL,
        "reason"                 "stock_movements_reason_enum" NOT NULL,
        "qty_delta"              integer       NOT NULL,
        "qty_before"             integer       NOT NULL,
        "qty_after"              integer       NOT NULL,
        "unit_cost_snapshot"     numeric(12,2) NOT NULL,
        "notes"                  text,
        "sale_transaction_id"    uuid,
        "consignment_request_id" uuid,
        "supplier_debt_id"       uuid,
        "created_at"             TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
        ADD CONSTRAINT "FK_stock_movements_inventory_entry"
          FOREIGN KEY ("inventory_entry_id") REFERENCES "inventory_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_stock_movements_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_movements_owner_created"
        ON "stock_movements" ("owner_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_movements_entry_created"
        ON "stock_movements" ("inventory_entry_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_movements_reason"
        ON "stock_movements" ("reason")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_movements_reason_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "external_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "external_transactions_type_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "external_contacts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "external_contacts_role_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "exchange_rates"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "consignment_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consignment_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "consignment_requests_status_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "sale_transactions"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payments_direction_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_entries_source_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "debtor_credits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "supplier_debts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
