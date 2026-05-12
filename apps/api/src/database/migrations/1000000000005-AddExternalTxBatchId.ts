import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalTxBatchId1000000000005 implements MigrationInterface {
  name = 'AddExternalTxBatchId1000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "external_transactions"
        ADD COLUMN IF NOT EXISTS "batch_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_external_transactions_batch"
        ON "external_transactions" ("batch_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_external_transactions_batch"`);
    await queryRunner.query(`ALTER TABLE "external_transactions" DROP COLUMN IF EXISTS "batch_id"`);
  }
}
