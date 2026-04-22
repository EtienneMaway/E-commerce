import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpensesAndWithdrawals1000000000001 implements MigrationInterface {
  name = 'AddExpensesAndWithdrawals1000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --------------------------------------------------------- expenses ENUMs
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "expense_currency_enum" AS ENUM (
          'USD', 'FC'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "expense_category_enum" AS ENUM (
          'TRANSPORT', 'RENT', 'UTILITIES', 'COMMUNICATION', 'STAFF',
          'PACKAGING', 'MARKETING', 'TAXES', 'MAINTENANCE', 'MEALS', 'OTHER'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // ---------------------------------------------------------------- expenses
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expenses" (
        "id"                     uuid             NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"               uuid             NOT NULL,
        "amount"                 numeric(12,2)    NOT NULL,
        "currency"               "expense_currency_enum"  NOT NULL,
        "category"               "expense_category_enum"  NOT NULL,
        "description"            character varying,
        "usd_to_fc_rate_snapshot" numeric(14,4)   DEFAULT NULL,
        "date"                   TIMESTAMP        NOT NULL,
        "created_at"             TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD CONSTRAINT "FK_expenses_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ------------------------------------------------------ withdrawals ENUMs
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "withdrawal_currency_enum" AS ENUM (
          'USD', 'FC'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // ------------------------------------------------------------- withdrawals
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "withdrawals" (
        "id"                     uuid          NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"               uuid          NOT NULL,
        "amount"                 numeric(12,2) NOT NULL,
        "currency"               "withdrawal_currency_enum" NOT NULL,
        "usd_to_fc_rate_snapshot" numeric(14,4) DEFAULT NULL,
        "amount_usd"             numeric(12,2) NOT NULL,
        "withdrawn_at"           TIMESTAMP     NOT NULL DEFAULT now(),
        "period_start_at"        TIMESTAMP     NOT NULL,
        "period_income"          numeric(12,2) NOT NULL,
        "period_expenses"        numeric(12,2) NOT NULL,
        "leftover_carried"       numeric(12,2) NOT NULL DEFAULT '0.00',
        "leftover_out"           numeric(12,2) NOT NULL,
        "note"                   character varying,
        CONSTRAINT "PK_withdrawals" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "withdrawals"
        ADD CONSTRAINT "FK_withdrawals_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS "withdrawals"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "withdrawal_currency_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "expense_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "expense_currency_enum"`);
  }
}
