import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientSaleIdToSales1000000000009 implements MigrationInterface {
  name = 'AddClientSaleIdToSales1000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Client-generated idempotency key for offline sales. The mobile sync
    // queue sends the same key on every retry, so a sale that was committed
    // server-side but whose response was lost on a flaky network is matched
    // here and not duplicated. Old rows stay NULL. Not unique: one split sale
    // produces several rows sharing the same key, so the index only speeds the
    // lookup — the dedup is "does any row with this key already exist?".
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "client_sale_id" VARCHAR NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_transactions_client_sale_id" ON "sale_transactions" ("owner_id", "client_sale_id") WHERE "client_sale_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_sale_transactions_client_sale_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_transactions" DROP COLUMN "client_sale_id"`,
    );
  }
}
