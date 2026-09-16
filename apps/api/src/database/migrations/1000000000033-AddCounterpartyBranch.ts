import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which of the *other* business's branches a debt or credit belongs to.
 *
 * `supplier_debts` sits on the debtor's books and `debtor_credits` on the
 * supplier's; they are two halves of one balance, paired only by the user pair
 * `(owner, counterparty)`. Once §3.4 makes both per-branch that pairing is
 * ambiguous: a supplier with two branches trading with the same debtor has two
 * credit rows, and `payments.approvePayment` — which runs on the supplier's
 * side and settles a debt row living on the debtor's books — would have to guess
 * which one to settle.
 *
 * Recording the counterparty's branch on both rows makes the match exact and
 * keeps debts per-branch, which is what the merchant asked for.
 *
 * Additive, like 032. The tightening pass (NOT NULL, the unique-constraint
 * swaps, `DROP COLUMN owner_id`) is migration **034**, at the end of Phase 4.
 */
export class AddCounterpartyBranch1000000000033 implements MigrationInterface {
  name = 'AddCounterpartyBranch1000000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    for (const table of ['supplier_debts', 'debtor_credits']) {
      await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "counterparty_org_id" uuid NULL`);
      await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "counterparty_shop_id" uuid NULL`);
    }

    // Backfill: every account has exactly one branch today, so the
    // counterparty's default shop IS the branch they traded from. This is only
    // true for rows that pre-date multi-branch trading — which is all of them.
    const defaults = `
      "organizations" o
      JOIN "shops" s ON s."org_id" = o."id" AND s."is_default"
    `;
    await q(`
      UPDATE "supplier_debts" d
         SET "counterparty_org_id" = o."id", "counterparty_shop_id" = s."id"
        FROM ${defaults}
       WHERE o."owner_user_id" = d."supplier_user_id" AND d."counterparty_org_id" IS NULL
    `);
    await q(`
      UPDATE "debtor_credits" c
         SET "counterparty_org_id" = o."id", "counterparty_shop_id" = s."id"
        FROM ${defaults}
       WHERE o."owner_user_id" = c."debtor_user_id" AND c."counterparty_org_id" IS NULL
    `);

    // Same composite FK as every other tenancy pair: the branch must belong to
    // the business named beside it. MATCH SIMPLE skips the check while either
    // column is NULL, which is what lets unconverted code keep writing.
    for (const table of ['supplier_debts', 'debtor_credits']) {
      await q(`
        ALTER TABLE "${table}"
          ADD CONSTRAINT "FK_${table}_counterparty_shop_org"
          FOREIGN KEY ("counterparty_shop_id", "counterparty_org_id")
          REFERENCES "shops" ("id", "org_id")
      `);
      await q(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_counterparty_shop"
          ON "${table}" ("counterparty_shop_id")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['supplier_debts', 'debtor_credits']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_counterparty_shop_org"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_counterparty_shop"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "counterparty_org_id"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "counterparty_shop_id"`);
    }
  }
}
