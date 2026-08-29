import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employee roles: an employer bundles "services" (feature areas) under a named
 * role and attaches it to an employment, so the employee only sees what was
 * opened for them — on the dashboard and on mobile.
 *
 * - employee_roles — the employer's reusable roles. `services` is a text[] of
 *   catalog keys from `common/services/service-catalog.ts`; '{}' (no services)
 *   is legal and means "login and leave the job, nothing else".
 * - employments.role_id — NULL for every existing row, and NULL keeps the
 *   pre-feature behaviour (unrestricted for the tier). Restricting someone is
 *   therefore an explicit act and this migration changes nobody's access.
 *
 * The FK is ON DELETE RESTRICT on purpose: NULL means *unrestricted*, so letting
 * a role deletion cascade to NULL would silently widen an employee's access.
 * Deleting a role that is still assigned must fail instead.
 *
 * Idempotent so it replays cleanly on databases that pre-date it.
 */
export class AddEmployeeRoles1000000000030 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "name" character varying(80) NOT NULL,
        "description" character varying(240),
        "services" text[] NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_roles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_roles_owner"
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_employee_roles_owner" ON "employee_roles" ("owner_id")`,
    );
    // One role name per employer, case-insensitive — "Cashier" and "cashier"
    // would be indistinguishable in the role picker.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_employee_roles_owner_name" ON "employee_roles" ("owner_id", lower("name"))`,
    );

    await queryRunner.query(
      `ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "role_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "employments" ADD CONSTRAINT "FK_employments_role"
          FOREIGN KEY ("role_id") REFERENCES "employee_roles"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    // Supports the "is this role still assigned?" check that guards deletion.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_employments_role" ON "employments" ("role_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_employments_role"`);
    await queryRunner.query(
      `ALTER TABLE "employments" DROP CONSTRAINT IF EXISTS "FK_employments_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employments" DROP COLUMN IF EXISTS "role_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_roles"`);
  }
}
