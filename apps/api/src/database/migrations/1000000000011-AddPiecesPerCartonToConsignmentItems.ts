import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPiecesPerCartonToConsignmentItems1000000000011 implements MigrationInterface {
  name = 'AddPiecesPerCartonToConsignmentItems1000000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consignment_items" ADD COLUMN IF NOT EXISTS "pieces_per_carton" integer NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consignment_items" DROP COLUMN IF EXISTS "pieces_per_carton"`,
    );
  }
}
