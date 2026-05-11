import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalaryPayments1000000000003 implements MigrationInterface {
  name = 'AddSalaryPayments1000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── employments — payroll fields ────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "employments"
        ADD COLUMN IF NOT EXISTS "monthly_pay" numeric(12,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "employments"
        ADD COLUMN IF NOT EXISTS "payroll_active" boolean NOT NULL DEFAULT true
    `);

    // ─── salary_payments ─────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "salary_payments_status_enum" AS ENUM (
          'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_payments" (
        "id"                uuid                                NOT NULL DEFAULT gen_random_uuid(),
        "employment_id"     uuid                                NOT NULL,
        "employer_id"       uuid                                NOT NULL,
        "employee_id"       uuid                                NOT NULL,
        "amount"            numeric(12,2)                       NOT NULL,
        "period_month"      varchar(7)                          NOT NULL,
        "status"            "salary_payments_status_enum"       NOT NULL,
        "note"              varchar,
        "rejection_reason"  varchar,
        "paid_at"           TIMESTAMP                           NOT NULL,
        "confirmed_at"      TIMESTAMP,
        "rejected_at"       TIMESTAMP,
        "cancelled_at"      TIMESTAMP,
        "created_at"        TIMESTAMP                           NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP                           NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salary_payments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "salary_payments"
        ADD CONSTRAINT "FK_salary_payments_employment"
          FOREIGN KEY ("employment_id") REFERENCES "employments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "salary_payments"
        ADD CONSTRAINT "FK_salary_payments_employer"
          FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "salary_payments"
        ADD CONSTRAINT "FK_salary_payments_employee"
          FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_salary_payments_employment"
        ON "salary_payments" ("employment_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_salary_payments_employee_status"
        ON "salary_payments" ("employee_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_salary_payments_employer_period"
        ON "salary_payments" ("employer_id", "period_month")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_salary_payments_employer_period"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_salary_payments_employee_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_salary_payments_employment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_payments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "salary_payments_status_enum"`);

    await queryRunner.query(`ALTER TABLE "employments" DROP COLUMN IF EXISTS "payroll_active"`);
    await queryRunner.query(`ALTER TABLE "employments" DROP COLUMN IF EXISTS "monthly_pay"`);
  }
}
