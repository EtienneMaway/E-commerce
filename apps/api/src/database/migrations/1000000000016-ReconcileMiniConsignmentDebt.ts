import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-off data reconciliation for mini-employee consignment debt.
 *
 * Before the per-lot return fix, approving a handover reversed the returned
 * units' debt at a single snapshot price (the oldest lot's agreed price) rather
 * than each returned unit's own batch price. When a mini's returned units spanned
 * batches consigned at different agreed rates (e.g. given at 2500 FC then 2600 FC
 * for 1 USD), the reversal was off, leaving a stale residual on the debt so
 * "Owes you" never reached 0 even when "Unsold with mini" did.
 *
 * This recomputes every mini's consignment debt from ground truth and snaps the
 * balances to it. A mini owes exactly:
 *     held value      — Σ (unit_cost × quantity_remaining) of their CONSIGNED_IN
 *                        stock still physically on hand, PLUS
 *     unsettled sold  — Σ (unit_cost × qty_sold) of sales made AFTER their last
 *                        approved handover (sold goods whose cash hasn't been
 *                        handed over yet).
 * That is the complete definition of a mini's debt — there is no other component
 * (advances/salary live in their own tables). The boundary mirrors the handover
 * preview (sales `> last approved handover`) so this stays consistent with what
 * the app settles.
 *
 * The correction is applied to `outstanding_balance` and localized to the field
 * the bug touched (`total_credit_given` on the debtor credit, `total_credit_
 * received` on the mirror supplier debt), preserving the invariant
 *   outstanding = total_credit_given − total_received.
 *
 * Idempotent: rows already matching ground truth are skipped, so re-running is a
 * no-op. Scoped to SALES_ONLY employment pairs only — owner/supplier/normal
 * debtor credits are never touched.
 */
export class ReconcileMiniConsignmentDebt1000000000016 implements MigrationInterface {
  name = 'ReconcileMiniConsignmentDebt1000000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ground-truth outstanding per (owner, mini) pair, into a temp table so both
    // the credit and the mirror-debt updates share one computation.
    await queryRunner.query(`
      CREATE TEMP TABLE mini_debt_recon ON COMMIT DROP AS
      WITH mini_pairs AS (
        SELECT DISTINCT dc."owner_id", dc."debtor_user_id" AS mini_id
        FROM "debtor_credits" dc
        JOIN "employments" e
          ON e."employer_id" = dc."owner_id"
         AND e."employee_id" = dc."debtor_user_id"
         AND e."tier" = 'SALES_ONLY'
      ),
      held AS (
        SELECT ie."owner_id" AS mini_id,
               COALESCE(SUM(ie."unit_cost" * ie."quantity_remaining"), 0) AS held_value
        FROM "inventory_entries" ie
        WHERE ie."source" = 'CONSIGNED_IN' AND ie."quantity_remaining" > 0
        GROUP BY ie."owner_id"
      ),
      last_ho AS (
        SELECT ms."mini_id", MAX(ms."approved_at") AS last_approved
        FROM "mini_settlements" ms
        WHERE ms."status" = 'APPROVED'
        GROUP BY ms."mini_id"
      ),
      unsettled AS (
        SELECT st."owner_id" AS mini_id,
               COALESCE(SUM(st."unit_cost" * st."qty_sold"), 0) AS unsettled_sold
        FROM "sale_transactions" st
        LEFT JOIN last_ho lh ON lh."mini_id" = st."owner_id"
        WHERE lh.last_approved IS NULL OR st."created_at" > lh.last_approved
        GROUP BY st."owner_id"
      )
      SELECT mp."owner_id",
             mp.mini_id,
             ROUND(COALESCE(h.held_value, 0) + COALESCE(u.unsettled_sold, 0), 4) AS true_outstanding
      FROM mini_pairs mp
      LEFT JOIN held h ON h.mini_id = mp.mini_id
      LEFT JOIN unsettled u ON u.mini_id = mp.mini_id
    `);

    // Debtor credit (owner's books): owner_id → mini via debtor_user_id.
    await queryRunner.query(`
      UPDATE "debtor_credits" dc
      SET "outstanding_balance" = r.true_outstanding,
          "total_credit_given" = dc."total_credit_given" - (dc."outstanding_balance" - r.true_outstanding),
          "updated_at" = now()
      FROM mini_debt_recon r
      WHERE dc."owner_id" = r."owner_id"
        AND dc."debtor_user_id" = r.mini_id
        AND dc."outstanding_balance" <> r.true_outstanding
    `);

    // Mirror supplier debt (mini's books): owner_id = mini, supplier_user_id = owner.
    await queryRunner.query(`
      UPDATE "supplier_debts" sd
      SET "outstanding_balance" = r.true_outstanding,
          "total_credit_received" = sd."total_credit_received" - (sd."outstanding_balance" - r.true_outstanding),
          "updated_at" = now()
      FROM mini_debt_recon r
      WHERE sd."owner_id" = r.mini_id
        AND sd."supplier_user_id" = r."owner_id"
        AND sd."outstanding_balance" <> r.true_outstanding
    `);
  }

  public async down(): Promise<void> {
    // Data reconciliation — the pre-correction residual figures aren't retained,
    // so there is nothing meaningful to restore. No-op.
  }
}
