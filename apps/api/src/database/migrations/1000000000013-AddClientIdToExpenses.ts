import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientIdToExpenses1000000000013 implements MigrationInterface {
  name = 'AddClientIdToExpenses1000000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "client_id" varchar NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_expenses_client" ON "expenses" ("owner_id", "client_id") WHERE "client_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_expenses_client"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "client_id"`);
  }
}
