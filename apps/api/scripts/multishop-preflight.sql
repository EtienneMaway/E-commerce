-- Multi-shop release: READ-ONLY preflight for the production database.
--
-- Run BEFORE migrations 032–036, against production (or a fresh restore of
-- it). It changes nothing: every statement is a SELECT. It answers two
-- questions:
--
--   1. Will any migration refuse to run? (032 and 035 abort rather than guess.)
--   2. What will move? (so the post-migration check has numbers to compare.)
--
--   psql "$DATABASE_URL" -f apps/api/scripts/multishop-preflight.sql
--
-- Every row in section 1 must say 0. Keep the output of section 2; run
-- section 2 again after migrating and compare the totals.

\echo '== 1. Blockers — every count must be 0 =='

-- 032 refuses: a payment that settles neither a debt nor a credit has no way to
-- reach a business.
SELECT 'payments with neither supplier_debt_id nor debtor_credit_id' AS blocker, count(*) AS n
  FROM payments WHERE supplier_debt_id IS NULL AND debtor_credit_id IS NULL
UNION ALL
-- 032 casts external_transactions.owner_id to uuid. The column is varchar on
-- some databases and already uuid on others, so compare it as text either way.
SELECT 'external_transactions.owner_id not a uuid', count(*)
  FROM external_transactions
 WHERE owner_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
UNION ALL
-- 032 backfills tenancy from the owner; an owner that is not a user leaves the
-- row with no business, and the orphan check aborts the migration.
SELECT 'inventory_entries owned by a missing user', count(*)
  FROM inventory_entries t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL
UNION ALL
SELECT 'sale_transactions owned by a missing user', count(*)
  FROM sale_transactions t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL
UNION ALL
SELECT 'supplier_debts owned by a missing user', count(*)
  FROM supplier_debts t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL
UNION ALL
SELECT 'debtor_credits owned by a missing user', count(*)
  FROM debtor_credits t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL
UNION ALL
SELECT 'expenses owned by a missing user', count(*)
  FROM expenses t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL
UNION ALL
SELECT 'employments whose employer is missing', count(*)
  FROM employments t LEFT JOIN users u ON u.id = t.employer_id WHERE u.id IS NULL
UNION ALL
SELECT 'consignment_requests whose supplier is missing', count(*)
  FROM consignment_requests t LEFT JOIN users u ON u.id = t.supplier_id WHERE u.id IS NULL
UNION ALL
-- 035 refuses (it no longer deletes): more than one discount config per owner.
SELECT 'owners with more than one quantity_discounts row', count(*)
  FROM (SELECT owner_id FROM quantity_discounts GROUP BY owner_id HAVING count(*) > 1) d
UNION ALL
-- 034 adds UNIQUE (shop_id, product_name) where the old key was (owner_id,
-- product_name); 032 gives each owner one shop, so this only fires if the old
-- constraint was somehow missing.
SELECT 'owners with duplicate product_prices names', count(*)
  FROM (SELECT owner_id, lower(product_name) FROM product_prices GROUP BY 1, 2 HAVING count(*) > 1) d
UNION ALL
SELECT 'owners with duplicate product_groups names', count(*)
  FROM (SELECT owner_id, lower(name) FROM product_groups GROUP BY 1, 2 HAVING count(*) > 1) d;

\echo '== 2. Inventory of what exists — keep this output =='

SELECT 'users' AS what, count(*) AS n FROM users
UNION ALL SELECT 'users holding stock, sales or debts', count(DISTINCT owner_id) FROM (
  SELECT owner_id FROM inventory_entries UNION SELECT owner_id FROM sale_transactions
  UNION SELECT owner_id FROM supplier_debts UNION SELECT owner_id FROM debtor_credits) h
UNION ALL SELECT 'inventory_entries', count(*) FROM inventory_entries
UNION ALL SELECT 'total quantity_remaining', coalesce(sum(quantity_remaining), 0) FROM inventory_entries
UNION ALL SELECT 'sale_transactions', count(*) FROM sale_transactions
UNION ALL SELECT 'total sale value (salePrice × qty)', round(coalesce(sum(sale_price * qty_sold), 0), 4) FROM sale_transactions
UNION ALL SELECT 'stock_movements', count(*) FROM stock_movements
UNION ALL SELECT 'supplier_debts', count(*) FROM supplier_debts
UNION ALL SELECT 'total supplier outstanding', round(coalesce(sum(outstanding_balance), 0), 4) FROM supplier_debts
UNION ALL SELECT 'debtor_credits', count(*) FROM debtor_credits
UNION ALL SELECT 'total debtor outstanding', round(coalesce(sum(outstanding_balance), 0), 4) FROM debtor_credits
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'expenses', count(*) FROM expenses
UNION ALL SELECT 'withdrawals', count(*) FROM withdrawals
UNION ALL SELECT 'external_contacts', count(*) FROM external_contacts
UNION ALL SELECT 'external_transactions', count(*) FROM external_transactions
UNION ALL SELECT 'consignment_requests', count(*) FROM consignment_requests
UNION ALL SELECT 'employments', count(*) FROM employments
UNION ALL SELECT 'salary_payments', count(*) FROM salary_payments
UNION ALL SELECT 'mini_settlements', count(*) FROM mini_settlements
UNION ALL SELECT 'mini_expenses', count(*) FROM mini_expenses
UNION ALL SELECT 'product_prices', count(*) FROM product_prices
UNION ALL SELECT 'product_groups', count(*) FROM product_groups
UNION ALL SELECT 'quantity_discounts', count(*) FROM quantity_discounts;

\echo '== 3. Mini employees whose books 036 moves into the employer business =='

SELECT
  CASE WHEN u.is_mini_employee THEN 'created as mini' ELSE 'existing account hired SALES_ONLY' END AS kind,
  count(DISTINCT e.employee_id) AS minis,
  count(DISTINCT ie.id) FILTER (WHERE ie.source = 'CONSIGNED_IN') AS consigned_lots
  FROM employments e
  JOIN users u ON u.id = e.employee_id
  LEFT JOIN inventory_entries ie ON ie.owner_id = e.employee_id AND ie.supplier_user_id = e.employer_id
 WHERE e.tier = 'SALES_ONLY'
 GROUP BY 1;
