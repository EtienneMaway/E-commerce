import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSoftDelete1000000000007 implements MigrationInterface {
  name = 'AddUserSoftDelete1000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "anonymized_at" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_deleted_at" ON "users" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "anonymized_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
  }
}
