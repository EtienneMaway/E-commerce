import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bump every money column from decimal(12,2) to decimal(14,4) so that
 * FC ⇄ USD conversions don't accumulate rounding loss. Existing values
 * zero-pad losslessly (25.00 → 25.0000).
 *
 * Excluded columns: usd_to_fc_rate_snapshot and exchange_rates.* — already
 * decimal(14,4).
 */
export class BumpMoneyPrecisionTo4dp1000000000006 implements MigrationInterface {
  name = 'BumpMoneyPrecisionTo4dp1000000000006';

  private readonly TARGETS: Array<{ table: string; column: string; default?: string }> = [
    { table: 'inventory_entries', column: 'unit_cost' },
    { table: 'inventory_entries', column: 'selling_price' },
    { table: 'inventory_entries', column: 'carton_price' },

    { table: 'consignment_items', column: 'agreed_unit_price' },
    { table: 'consignment_items', column: 'unit_cost' },
    { table: 'consignment_items', column: 'original_unit_price' },

    { table: 'employments', column: 'monthly_pay' },

    { table: 'payments', column: 'amount' },
    { table: 'payments', column: 'remaining_balance' },

    { table: 'expenses', column: 'amount' },

    { table: 'salary_payments', column: 'amount' },

    { table: 'stock_movements', column: 'unit_cost_snapshot' },

    { table: 'withdrawals', column: 'amount' },
    { table: 'withdrawals', column: 'amount_usd' },
    { table: 'withdrawals', column: 'period_income' },
    { table: 'withdrawals', column: 'period_expenses' },
    { table: 'withdrawals', column: 'leftover_carried', default: '0.0000' },
    { table: 'withdrawals', column: 'leftover_out' },

    { table: 'debtor_credits', column: 'total_credit_given', default: '0.0000' },
    { table: 'debtor_credits', column: 'total_received', default: '0.0000' },
    { table: 'debtor_credits', column: 'outstanding_balance', default: '0.0000' },

    { table: 'supplier_debts', column: 'total_credit_received', default: '0.0000' },
    { table: 'supplier_debts', column: 'total_paid', default: '0.0000' },
    { table: 'supplier_debts', column: 'outstanding_balance', default: '0.0000' },

    { table: 'external_contacts', column: 'debtor_balance', default: '0.0000' },
    { table: 'external_contacts', column: 'supplier_balance', default: '0.0000' },

    { table: 'product_prices', column: 'unit_price' },

    { table: 'external_transactions', column: 'unit_price' },
    { table: 'external_transactions', column: 'amount' },
    { table: 'external_transactions', column: 'unit_cost_used' },
    { table: 'external_transactions', column: 'profit' },
    { table: 'external_transactions', column: 'original_unit_price' },

    { table: 'sale_transactions', column: 'unit_cost' },
    { table: 'sale_transactions', column: 'sale_price' },
    { table: 'sale_transactions', column: 'profit' },
    { table: 'sale_transactions', column: 'original_unit_price' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column, default: defaultValue } of this.TARGETS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE numeric(14, 4)`,
      );
      if (defaultValue !== undefined) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}'`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column, default: defaultValue } of this.TARGETS) {
      if (defaultValue !== undefined) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT '0.00'`,
        );
      }
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE numeric(12, 2)`,
      );
    }
  }
}
