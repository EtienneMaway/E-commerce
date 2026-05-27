import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientToSales1000000000008 implements MigrationInterface {
  name = 'AddClientToSales1000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN "client_name" VARCHAR NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN "client_phone" VARCHAR NULL`,
    );
    // Group all sale rows that came out of one cart submission. Lets a single
    // tap in the mobile sales tab reprint the entire original receipt (multi-
    // item) rather than just the row that was tapped. Populated from the
    // client at sale time — old rows stay NULL and reprint as single items.
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN "receipt_id" VARCHAR NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_transactions_receipt_id" ON "sale_transactions" ("receipt_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_transactions_client_phone" ON "sale_transactions" ("client_phone") WHERE "client_phone" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_transactions_client_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_transactions_receipt_id"`);
    await queryRunner.query(`ALTER TABLE "sale_transactions" DROP COLUMN "receipt_id"`);
    await queryRunner.query(`ALTER TABLE "sale_transactions" DROP COLUMN "client_phone"`);
    await queryRunner.query(`ALTER TABLE "sale_transactions" DROP COLUMN "client_name"`);
  }
}
