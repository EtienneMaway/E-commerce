-- Backfill SupplierDebt rows for existing ACCEPTED consignments that are missing them.
-- Run once against the trading_app database after deploying the fix.
--
-- For each ACCEPTED consignment, sum up the total value per (debtor, supplier) pair
-- and upsert a SupplierDebt row on the debtor's books.

INSERT INTO supplier_debts (
  id,
  owner_id,          -- debtor (the one who owes)
  supplier_user_id,  -- supplier (the one owed to)
  total_credit_received,
  total_paid,
  outstanding_balance,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  cr.debtor_id      AS owner_id,
  cr.supplier_id    AS supplier_user_id,
  SUM(ci.agreed_unit_price::numeric * ci.quantity) AS total_credit_received,
  0.00              AS total_paid,
  SUM(ci.agreed_unit_price::numeric * ci.quantity) AS outstanding_balance,
  MIN(cr.created_at),
  NOW()
FROM consignment_requests cr
JOIN consignment_items ci ON ci.consignment_request_id = cr.id
WHERE cr.status = 'ACCEPTED'
GROUP BY cr.debtor_id, cr.supplier_id
ON CONFLICT (owner_id, supplier_user_id)
DO UPDATE SET
  total_credit_received = EXCLUDED.total_credit_received,
  outstanding_balance   = EXCLUDED.outstanding_balance,
  updated_at            = NOW();
