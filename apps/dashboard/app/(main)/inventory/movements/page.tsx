'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  stockMovementsApi,
  POSITIVE_REASONS_SET,
  type StockMovement,
} from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { formatDate } from '../../../../lib/utils';
import { useFormatCurrency } from '../../../../lib/currency';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { Badge } from '../../../../components/ui/Badge';
import { useT } from '../../../../lib/i18n';

const ALL_REASONS = [
  'PURCHASE',
  'RECEIVE_SUPPLIER',
  'CUSTOMER_RETURN',
  'RECOUNT_UP',
  'OTHER_IN',
  'SALE',
  'CONSIGN_OUT',
  'DAMAGE',
  'LOSS',
  'THEFT',
  'EXPIRY',
  'SUPPLIER_RETURN',
  'INTERNAL_USE',
  'RECOUNT_DOWN',
  'OTHER_OUT',
] as const;
type ReasonKey = (typeof ALL_REASONS)[number];

export default function StockMovementsPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();

  const [reason, setReason] = useState<ReasonKey | ''>('');
  const [productName, setProductName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const filters = {
    reason: reason || undefined,
    productName: productName.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit,
  };

  const { data, isLoading } = useQuery({
    queryKey: QK.stockMovements(filters),
    queryFn: () => stockMovementsApi.list(filters),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function reasonLabel(r: string): string {
    return (
      (t.stockMovements.reason as Record<string, string>)[r] ?? r
    );
  }

  function reasonVariant(
    r: string,
  ): 'profit' | 'loss' | 'personal' | 'supplier' | 'consigned' | 'pending' {
    if (POSITIVE_REASONS_SET.has(r)) return 'profit';
    return 'loss';
  }

  const COLUMNS: Column<StockMovement>[] = [
    {
      key: 'createdAt',
      header: t.stockMovements.colDate,
      render: (m) => formatDate(m.createdAt),
    },
    {
      key: 'product',
      header: t.stockMovements.colProduct,
      render: (m) => {
        const pn = m.inventoryEntry?.productName ?? '—';
        return (
          <Link
            href={`/inventory/${encodeURIComponent(pn)}`}
            className="font-medium hover:text-primary"
            style={{ color: 'var(--foreground)' }}
          >
            {pn.charAt(0).toUpperCase() + pn.slice(1)}
          </Link>
        );
      },
    },
    {
      key: 'source',
      header: t.stockMovements.colSource,
      render: (m) => (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {m.inventoryEntry?.source ?? '—'}
        </span>
      ),
    },
    {
      key: 'reason',
      header: t.stockMovements.colReason,
      render: (m) => (
        <Badge label={reasonLabel(m.reason)} variant={reasonVariant(m.reason)} />
      ),
    },
    {
      key: 'qtyDelta',
      header: t.stockMovements.colDelta,
      render: (m) => (
        <span
          style={{
            fontWeight: 600,
            color: m.qtyDelta >= 0 ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
        </span>
      ),
    },
    {
      key: 'beforeAfter',
      header: t.stockMovements.colBeforeAfter,
      render: (m) => (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {m.qtyBefore} → {m.qtyAfter}
        </span>
      ),
    },
    {
      key: 'value',
      header: t.stockMovements.colValueImpact,
      render: (m) => {
        const value = (
          Math.abs(m.qtyDelta) * parseFloat(m.unitCostSnapshot)
        ).toFixed(2);
        return (
          <span style={{ color: 'var(--muted)' }}>{formatCurrency(value)}</span>
        );
      },
    },
    {
      key: 'notes',
      header: t.stockMovements.colNotes,
      render: (m) =>
        m.notes ? (
          <span
            className="text-xs"
            title={m.notes}
            style={{
              color: 'var(--muted)',
              display: 'inline-block',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {m.notes}
          </span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        ),
    },
  ];

  function clearFilters() {
    setReason('');
    setProductName('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.stockMovements.title}</h1>
          <p className="page-sub">{t.stockMovements.sub}</p>
        </div>
      </div>

      <div className="page-content">
        {/* Filters */}
        <div
          className="rounded-xl p-4 mb-4 border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              {t.stockMovements.filterReason}
            </label>
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value as ReasonKey | '');
                setPage(1);
              }}
              className="input"
            >
              <option value="">{t.stockMovements.filterAllReasons}</option>
              {ALL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {reasonLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              {t.stockMovements.filterProduct}
            </label>
            <input
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                setPage(1);
              }}
              placeholder="..."
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              {t.stockMovements.filterDateFrom}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              {t.stockMovements.filterDateTo}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="input"
            />
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="btn btn-secondary w-full">
              {t.stockMovements.filterClear}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>{t.stockMovements.loading}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {t.stockMovements.noMovements}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {t.stockMovements.noMovementsSub}
            </p>
          </div>
        ) : (
          <>
            <DataTable
              columns={COLUMNS}
              data={rows}
              keyField="id"
              searchPlaceholder=""
              searchFields={[]}
            />

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.stockMovements.pageOf(page, totalPages)}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t.stockMovements.prev}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t.stockMovements.next}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
