import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tier-change proposal (mini ↔ full), mirroring `pending_shop_id`'s shape:
 * a nullable column on the same employment row, set by the employer and
 * cleared by the employee's accept/reject.
 */
export class AddPendingTierToEmployments1000000000039 implements MigrationInterface {
  name = 'AddPendingTierToEmployments1000000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employments"
        ADD COLUMN IF NOT EXISTS "pending_tier" "employments_tier_enum" NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employments" DROP COLUMN IF EXISTS "pending_tier"`);
  }
}
