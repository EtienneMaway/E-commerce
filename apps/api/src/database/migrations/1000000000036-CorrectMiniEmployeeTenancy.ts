import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Put every pre-branch mini-employee row in the EMPLOYER's business and branch.
 *
 * A mini holds the employer's goods on their own books (`owner_id` = the mini),
 * but those books belong to the employer's business. The live code writes it
 * that way; the backfill of 032/033 did not, for three reasons:
 *
 *   1. 032 moved a mini's consigned lots only when the account was created as a
 *      mini (`users.is_mini_employee`). An existing account hired as SALES_ONLY
 *      — which the guard treats as a mini — kept its lots, sales and movements
 *      in its own organization, where neither the employer nor the mini's
 *      employer-scoped screens can see them.
 *   2. The mini's `supplier_debts` row (what they owe the employer) and the
 *      employer's `debtor_credits` row for the mini were never moved or paired:
 *      032 put the debt in the mini's org, 033 pointed both counterparties at the
 *      mini's org. A mini mid-cycle would read a zero balance, be refused
 *      expenses ("only while holding goods"), and a handover could not find the
 *      debt it settles.
 *   3. ACCEPTED consignments to a mini got the mini's org as the receiving side,
 *      and a payment settled through the mini's debt inherited the mini's org.
 *
 * Nothing is deleted and no amount changes — rows move between two
 * organizations that the migrations themselves created, and only rows whose
 * pairing with a SALES_ONLY employment proves they were mini business. A lot
 * only moves if it was received while that employment was open, so a person who
 * traded with the same merchant independently keeps those rows.
 *
 * Idempotent: every UPDATE only touches rows not already in the employer's
 * branch, so re-running is a no-op. Asserts the result before committing.
 */
export class CorrectMiniEmployeeTenancy1000000000036 implements MigrationInterface {
  name = 'CorrectMiniEmployeeTenancy1000000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string): Promise<unknown> => queryRunner.query(sql);

    // The employer's branch for each mini pair: the employment row carries it
    // (032 backfilled employments to the employer's default shop, and hires
    // since then record the branch they hired into). Latest employment wins.
    const pair = `
      SELECT DISTINCT ON (e."employee_id", e."employer_id")
             e."employee_id" AS mini_id, e."employer_id" AS employer_id,
             e."org_id", e."shop_id"
        FROM "employments" e
       WHERE e."tier" = 'SALES_ONLY'
       ORDER BY e."employee_id", e."employer_id", e."created_at" DESC
    `;

    // Lots received from the employer while employed by them.
    const miniLot = `
      SELECT ie."id", p."org_id", p."shop_id"
        FROM "inventory_entries" ie
        JOIN (${pair}) p ON p.mini_id = ie."owner_id" AND p.employer_id = ie."supplier_user_id"
       WHERE ie."source" = 'CONSIGNED_IN'
         AND EXISTS (
           SELECT 1 FROM "employments" e
            WHERE e."employee_id" = ie."owner_id" AND e."employer_id" = ie."supplier_user_id"
              AND e."tier" = 'SALES_ONLY'
              AND ie."created_at" >= e."created_at"
              AND (e."terminated_at" IS NULL OR ie."created_at" <= e."terminated_at")
         )
    `;

    // 1. Lots, then the sales and movements off them (they follow the lot).
    await q(`
      UPDATE "inventory_entries" ie SET "org_id" = m."org_id", "shop_id" = m."shop_id"
        FROM (${miniLot}) m
       WHERE m."id" = ie."id" AND (ie."org_id" <> m."org_id" OR ie."shop_id" <> m."shop_id")
    `);
    await q(`
      UPDATE "sale_transactions" st SET "org_id" = ie."org_id", "shop_id" = ie."shop_id"
        FROM "inventory_entries" ie
       WHERE ie."id" = st."inventory_entry_id" AND ie."id" IN (SELECT "id" FROM (${miniLot}) m)
         AND (st."org_id" <> ie."org_id" OR st."shop_id" <> ie."shop_id")
    `);
    await q(`
      UPDATE "stock_movements" sm SET "org_id" = ie."org_id", "shop_id" = ie."shop_id"
        FROM "inventory_entries" ie
       WHERE ie."id" = sm."inventory_entry_id" AND ie."id" IN (SELECT "id" FROM (${miniLot}) m)
         AND (sm."org_id" <> ie."org_id" OR sm."shop_id" <> ie."shop_id")
    `);

    // 2. The mini's debt to the employer: in the employer's branch, paired with it.
    await q(`
      UPDATE "supplier_debts" d
         SET "org_id" = p."org_id", "shop_id" = p."shop_id",
             "counterparty_org_id" = p."org_id", "counterparty_shop_id" = p."shop_id"
        FROM (${pair}) p
       WHERE p.mini_id = d."owner_id" AND p.employer_id = d."supplier_user_id"
         AND (d."org_id" <> p."org_id" OR d."shop_id" <> p."shop_id"
              OR d."counterparty_org_id" IS DISTINCT FROM p."org_id"
              OR d."counterparty_shop_id" IS DISTINCT FROM p."shop_id")
    `);

    // 3. The employer's credit for the mini: already in the employer's branch;
    //    its counterparty is the same branch, not the mini's own org.
    await q(`
      UPDATE "debtor_credits" c
         SET "counterparty_org_id" = p."org_id", "counterparty_shop_id" = p."shop_id"
        FROM (${pair}) p
       WHERE p.employer_id = c."owner_id" AND p.mini_id = c."debtor_user_id"
         AND (c."counterparty_org_id" IS DISTINCT FROM p."org_id"
              OR c."counterparty_shop_id" IS DISTINCT FROM p."shop_id")
    `);

    // 4. Accepted consignments to a mini were received at the employer's branch.
    await q(`
      UPDATE "consignment_requests" r
         SET "debtor_org_id" = p."org_id", "debtor_shop_id" = p."shop_id"
        FROM (${pair}) p
       WHERE p.employer_id = r."supplier_id" AND p.mini_id = r."debtor_id"
         AND r."status" = 'ACCEPTED'
         AND (r."debtor_org_id" IS DISTINCT FROM p."org_id"
              OR r."debtor_shop_id" IS DISTINCT FROM p."shop_id")
    `);

    // 5. A payment settled through the mini's debt follows that debt.
    await q(`
      UPDATE "payments" pay SET "org_id" = d."org_id", "shop_id" = d."shop_id"
        FROM "supplier_debts" d
        JOIN (${pair}) p ON p.mini_id = d."owner_id" AND p.employer_id = d."supplier_user_id"
       WHERE d."id" = pay."supplier_debt_id"
         AND (pay."org_id" <> d."org_id" OR pay."shop_id" <> d."shop_id")
    `);

    // ── Assert ──────────────────────────────────────────────────────────────
    const checks: { label: string; sql: string }[] = [
      {
        label: 'mini lots outside the employer branch',
        sql: `SELECT count(*)::int AS n FROM "inventory_entries" ie
                JOIN (${miniLot}) m ON m."id" = ie."id"
               WHERE ie."org_id" <> m."org_id" OR ie."shop_id" <> m."shop_id"`,
      },
      {
        label: 'sales off mini lots outside the lot branch',
        sql: `SELECT count(*)::int AS n FROM "sale_transactions" st
                JOIN "inventory_entries" ie ON ie."id" = st."inventory_entry_id"
               WHERE ie."id" IN (SELECT "id" FROM (${miniLot}) m)
                 AND (st."org_id" <> ie."org_id" OR st."shop_id" <> ie."shop_id")`,
      },
      {
        label: 'mini debts not at the employer branch',
        sql: `SELECT count(*)::int AS n FROM "supplier_debts" d
                JOIN (${pair}) p ON p.mini_id = d."owner_id" AND p.employer_id = d."supplier_user_id"
               WHERE d."org_id" <> p."org_id" OR d."counterparty_org_id" IS DISTINCT FROM p."org_id"`,
      },
    ];
    const failures: string[] = [];
    for (const { label, sql } of checks) {
      const rows = (await queryRunner.query(sql)) as { n: number }[];
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) failures.push(`${label}: ${n}`);
    }
    if (failures.length > 0) {
      throw new Error(
        `CorrectMiniEmployeeTenancy1000000000036 left rows misplaced — refusing to continue.\n  ` +
          failures.join('\n  '),
      );
    }
  }

  /**
   * Nothing to undo that would be correct: the rows were misplaced before this
   * ran. Reverting 032 drops the columns outright.
   */
  public async down(): Promise<void> {
    return Promise.resolve();
  }
}
